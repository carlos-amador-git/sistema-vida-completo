// src/modules/auth/auth.controller.ts
import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { authService, AuthError } from './auth.service';
import { authMiddleware } from '../../common/guards/auth.middleware';

const router = Router();

// Validadores
const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('La contraseña debe tener al menos 8 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La contraseña debe contener mayúsculas, minúsculas y números'),
  body('curp')
    .isLength({ min: 18, max: 18 })
    .withMessage('El CURP debe tener 18 caracteres'),
  body('name')
    .trim()
    .isLength({ min: 2 })
    .withMessage('El nombre es requerido'),
  body('phone')
    .optional()
    .isMobilePhone('es-MX')
    .withMessage('Teléfono inválido'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Contraseña requerida'),
];

// Helper para manejar errores de validación
const handleValidation = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.type === 'field' ? err.path : 'unknown',
        message: err.msg,
      })),
    });
  }
  next();
};

/**
 * POST /api/v1/auth/register
 * Registra un nuevo usuario
 */
router.post('/register', registerValidation, handleValidation, async (req: Request, res: Response) => {
  try {
    const { email, password, curp, name, phone, dateOfBirth, sex } = req.body;
    
    const result = await authService.register({
      email,
      password,
      curp,
      name,
      phone,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      sex,
    });
    
    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente. Verifica tu correo electrónico.',
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          curp: result.user.curp,
          isVerified: result.user.isVerified,
        },
        tokens: result.tokens,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }
    console.error('Error en registro:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
    });
  }
});

/**
 * POST /api/v1/auth/login
 * Inicia sesión
 */
router.post('/login', loginValidation, handleValidation, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.get('User-Agent');
    
    const result = await authService.login({ email, password }, ipAddress, userAgent);
    
    res.json({
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          curp: result.user.curp,
          isVerified: result.user.isVerified,
        },
        tokens: result.tokens,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(401).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
    });
  }
});

/**
 * POST /api/v1/auth/refresh
 * Refresca el access token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TOKEN', message: 'Refresh token requerido' },
      });
    }
    
    const tokens = await authService.refreshTokens(refreshToken);
    
    res.json({
      success: true,
      data: { tokens },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(401).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }
    console.error('Error en refresh:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
    });
  }
});

/**
 * POST /api/v1/auth/logout
 * Cierra sesión
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      await authService.logout(refreshToken);
    }
    
    res.json({
      success: true,
      message: 'Sesión cerrada exitosamente',
    });
  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
    });
  }
});

/**
 * POST /api/v1/auth/logout-all
 * Cierra todas las sesiones (requiere autenticación)
 */
router.post('/logout-all', authMiddleware, async (req: Request, res: Response) => {
  try {
    await authService.logoutAll(req.userId!);
    
    res.json({
      success: true,
      message: 'Todas las sesiones han sido cerradas',
    });
  } catch (error) {
    console.error('Error en logout-all:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
    });
  }
});

/**
 * POST /api/v1/auth/verify-email
 * Verifica el email del usuario
 */
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TOKEN', message: 'Token requerido' },
      });
    }
    
    await authService.verifyEmail(token);
    
    res.json({
      success: true,
      message: 'Email verificado exitosamente',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }
    console.error('Error en verify-email:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
    });
  }
});

/**
 * POST /api/v1/auth/forgot-password
 * Solicita recuperación de contraseña
 */
router.post('/forgot-password', 
  body('email').isEmail().normalizeEmail(),
  handleValidation,
  async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      await authService.requestPasswordReset(email);
      
      // Siempre responder éxito para no revelar si el email existe
      res.json({
        success: true,
        message: 'Si el email existe, recibirás instrucciones para restablecer tu contraseña',
      });
    } catch (error) {
      console.error('Error en forgot-password:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
      });
    }
  }
);

/**
 * POST /api/v1/auth/reset-password
 * Restablece la contraseña
 */
router.post('/reset-password',
  body('token').notEmpty(),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  handleValidation,
  async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;
      
      await authService.resetPassword(token, password);
      
      res.json({
        success: true,
        message: 'Contraseña restablecida exitosamente',
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(400).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }
      console.error('Error en reset-password:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
      });
    }
  }
);

/**
 * GET /api/v1/auth/me
 * Obtiene el usuario actual (requiere autenticación)
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { profile: true },
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'Usuario no encontrado' },
      });
    }
    
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          curp: user.curp,
          phone: user.phone,
          dateOfBirth: user.dateOfBirth,
          sex: user.sex,
          isVerified: user.isVerified,
          hasProfile: !!user.profile,
        },
      },
    });
  } catch (error) {
    console.error('Error en /me:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error interno del servidor' },
    });
  }
});

export default router;
