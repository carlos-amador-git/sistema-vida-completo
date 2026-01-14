// src/modules/pup/pup.controller.ts
import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authMiddleware } from '../../common/guards/auth.middleware';
import { pupService } from './pup.service';

const router = Router();

// Todos los endpoints requieren autenticación
router.use(authMiddleware);

/**
 * GET /api/v1/profile
 * Obtiene el perfil del usuario actual
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const profile = await pupService.getProfile(req.userId!);
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'Perfil no encontrado' },
      });
    }
    
    res.json({
      success: true,
      data: { profile },
    });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
    });
  }
});

/**
 * PUT /api/v1/profile
 * Actualiza el perfil del usuario
 */
router.put('/',
  body('bloodType').optional().isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  body('allergies').optional().isArray(),
  body('conditions').optional().isArray(),
  body('medications').optional().isArray(),
  body('insuranceProvider').optional().isString(),
  body('insurancePolicy').optional().isString(),
  body('insurancePhone').optional().isString(),
  body('isDonor').optional().isBoolean(),
  body('donorPreferences').optional().isObject(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }
      
      const profile = await pupService.updateProfile(req.userId!, req.body);
      
      res.json({
        success: true,
        data: { profile },
      });
    } catch (error) {
      console.error('Error actualizando perfil:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
      });
    }
  }
);

/**
 * POST /api/v1/profile/photo
 * Actualiza la foto de perfil
 * Espera el URL de la imagen (después de subir a S3)
 */
router.post('/photo',
  body('photoUrl').isURL().withMessage('URL de imagen inválido'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }
      
      const profile = await pupService.updatePhoto(req.userId!, req.body.photoUrl);
      
      res.json({
        success: true,
        data: { profile },
      });
    } catch (error) {
      console.error('Error actualizando foto:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
      });
    }
  }
);

/**
 * GET /api/v1/profile/qr
 * Obtiene el código QR del usuario
 */
router.get('/qr', async (req: Request, res: Response) => {
  try {
    const qrData = await pupService.getQR(req.userId!);
    
    if (!qrData) {
      return res.status(404).json({
        success: false,
        error: { code: 'QR_NOT_FOUND', message: 'Código QR no encontrado' },
      });
    }
    
    res.json({
      success: true,
      data: qrData,
    });
  } catch (error) {
    console.error('Error obteniendo QR:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
    });
  }
});

/**
 * POST /api/v1/profile/qr/regenerate
 * Regenera el código QR (invalida el anterior)
 */
router.post('/qr/regenerate', async (req: Request, res: Response) => {
  try {
    const qrData = await pupService.regenerateQR(req.userId!);
    
    res.json({
      success: true,
      message: 'Código QR regenerado exitosamente. El código anterior ya no es válido.',
      data: qrData,
    });
  } catch (error) {
    console.error('Error regenerando QR:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
    });
  }
});

export default router;
