// src/modules/admin/admin-auth.controller.ts
import { Router, Request, Response } from 'express';
import { adminAuthService } from './admin-auth.service';
import { adminAuthMiddleware } from '../../common/guards/admin-auth.middleware';
import { requireSuperAdmin } from '../../common/guards/admin-roles.guard';

const router = Router();

/**
 * POST /api/v1/admin/auth/login
 * Inicia sesion de administrador
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Email y contrasena son requeridos',
        },
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await adminAuthService.login(email, password, ipAddress, userAgent);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Admin login error:', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'LOGIN_ERROR',
        message: error.message || 'Error al iniciar sesion',
      },
    });
  }
});

/**
 * POST /api/v1/admin/auth/logout
 * Cierra sesion de administrador
 */
router.post('/logout', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Refresh token requerido',
        },
      });
    }

    await adminAuthService.logout(refreshToken, req.adminId!);

    res.json({
      success: true,
      message: 'Sesion cerrada correctamente',
    });
  } catch (error: any) {
    console.error('Admin logout error:', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'LOGOUT_ERROR',
        message: error.message || 'Error al cerrar sesion',
      },
    });
  }
});

/**
 * POST /api/v1/admin/auth/refresh
 * Renueva tokens de acceso
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Refresh token requerido',
        },
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await adminAuthService.refreshTokens(refreshToken, ipAddress, userAgent);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Admin refresh error:', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'REFRESH_ERROR',
        message: error.message || 'Error al renovar tokens',
      },
    });
  }
});

/**
 * GET /api/v1/admin/auth/me
 * Obtiene informacion del admin actual
 */
router.get('/me', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const admin = await adminAuthService.getMe(req.adminId!);

    res.json({
      success: true,
      data: admin,
    });
  } catch (error: any) {
    console.error('Admin get me error:', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message || 'Error al obtener datos',
      },
    });
  }
});

/**
 * POST /api/v1/admin/auth/change-password
 * Cambia la contrasena del admin
 */
router.post('/change-password', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Contrasena actual y nueva son requeridas',
        },
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;

    await adminAuthService.changePassword(req.adminId!, currentPassword, newPassword, ipAddress);

    res.json({
      success: true,
      message: 'Contrasena cambiada correctamente. Inicie sesion nuevamente.',
    });
  } catch (error: any) {
    console.error('Admin change password error:', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message || 'Error al cambiar contrasena',
      },
    });
  }
});

// ==================== GESTION DE ADMINS (Solo Super Admin) ====================

/**
 * GET /api/v1/admin/auth/admins
 * Lista todos los administradores
 */
router.get('/admins', adminAuthMiddleware, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const admins = await adminAuthService.listAdmins(req.adminId!);

    res.json({
      success: true,
      data: admins,
    });
  } catch (error: any) {
    console.error('Admin list error:', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message || 'Error al listar administradores',
      },
    });
  }
});

/**
 * POST /api/v1/admin/auth/admins
 * Crea un nuevo administrador
 */
router.post('/admins', adminAuthMiddleware, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { email, password, name, role, permissions, isSuperAdmin } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Email, password, name y role son requeridos',
        },
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;

    const admin = await adminAuthService.createAdmin(
      req.adminId!,
      { email, password, name, role, permissions, isSuperAdmin },
      ipAddress
    );

    res.status(201).json({
      success: true,
      data: admin,
    });
  } catch (error: any) {
    console.error('Admin create error:', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message || 'Error al crear administrador',
      },
    });
  }
});

/**
 * PUT /api/v1/admin/auth/admins/:id
 * Actualiza un administrador
 */
router.put('/admins/:id', adminAuthMiddleware, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, role, permissions, isActive } = req.body;

    const ipAddress = req.ip || req.connection.remoteAddress;

    const admin = await adminAuthService.updateAdmin(
      req.adminId!,
      id,
      { name, role, permissions, isActive },
      ipAddress
    );

    res.json({
      success: true,
      data: admin,
    });
  } catch (error: any) {
    console.error('Admin update error:', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message || 'Error al actualizar administrador',
      },
    });
  }
});

export default router;
