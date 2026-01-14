// src/modules/emergency/emergency.controller.ts
import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { emergencyService } from './emergency.service';
import { authMiddleware, optionalAuthMiddleware } from '../../common/guards/auth.middleware';

const router = Router();

/**
 * POST /api/v1/emergency/access
 * Inicia un acceso de emergencia (escaneo de QR)
 * NO requiere autenticación - es acceso público de emergencia
 */
router.post('/access',
  body('qrToken').isUUID().withMessage('Token QR inválido'),
  body('accessorName').trim().notEmpty().withMessage('Nombre del profesional requerido'),
  body('accessorRole').trim().notEmpty().withMessage('Rol del profesional requerido'),
  body('accessorLicense').optional().isString(),
  body('institutionId').optional().isUUID(),
  body('institutionName').optional().isString(),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  body('locationName').optional().isString(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      
      const { 
        qrToken, 
        accessorName, 
        accessorRole, 
        accessorLicense,
        institutionId,
        institutionName,
        latitude,
        longitude,
        locationName,
      } = req.body;
      
      const result = await emergencyService.initiateEmergencyAccess({
        qrToken,
        accessorName,
        accessorRole,
        accessorLicense,
        institutionId,
        institutionName,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        latitude,
        longitude,
        locationName,
      });
      
      if (!result) {
        return res.status(404).json({
          success: false,
          error: { 
            code: 'PATIENT_NOT_FOUND', 
            message: 'No se encontró paciente con este código QR' 
          },
        });
      }
      
      res.json({
        success: true,
        message: 'Acceso de emergencia autorizado',
        data: result,
      });
    } catch (error) {
      console.error('Error en acceso de emergencia:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
      });
    }
  }
);

/**
 * GET /api/v1/emergency/verify/:accessToken
 * Verifica si un token de acceso de emergencia es válido
 */
router.get('/verify/:accessToken',
  param('accessToken').isUUID(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      
      const access = await emergencyService.verifyAccessToken(req.params.accessToken);
      
      if (!access) {
        return res.status(401).json({
          success: false,
          error: { 
            code: 'INVALID_TOKEN', 
            message: 'Token de acceso inválido o expirado' 
          },
        });
      }
      
      res.json({
        success: true,
        data: {
          valid: true,
          expiresAt: access.expiresAt,
          accessedAt: access.accessedAt,
        },
      });
    } catch (error) {
      console.error('Error verificando token:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
      });
    }
  }
);

/**
 * GET /api/v1/emergency/history
 * Obtiene el historial de accesos de emergencia del usuario autenticado
 */
router.get('/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const history = await emergencyService.getAccessHistory(req.userId!);
    
    res.json({
      success: true,
      data: { 
        accesses: history.map(access => ({
          id: access.id,
          accessorName: access.accessorName,
          accessorRole: access.accessorRole,
          institutionName: access.institutionName,
          locationName: access.locationName,
          accessedAt: access.accessedAt,
          dataAccessed: access.dataAccessed,
        })),
      },
    });
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
    });
  }
});

export default router;
