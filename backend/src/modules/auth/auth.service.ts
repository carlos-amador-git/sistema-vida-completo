// src/modules/auth/auth.service.ts
import { PrismaClient, User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import config from '../../config';
import { generateSecureToken } from '../../common/utils/encryption';

const prisma = new PrismaClient();

// Tipos
interface TokenPayload {
  userId: string;
  email: string;
  type: 'access' | 'refresh';
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface RegisterInput {
  email: string;
  password: string;
  curp: string;
  name: string;
  phone?: string;
  dateOfBirth?: Date;
  sex?: string;
}

interface LoginInput {
  email: string;
  password: string;
}

// Errores personalizados
export class AuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

class AuthService {
  /**
   * Registra un nuevo usuario
   */
  async register(input: RegisterInput): Promise<{ user: User; tokens: AuthTokens }> {
    // Verificar si el email ya existe
    const existingEmail = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (existingEmail) {
      throw new AuthError('EMAIL_EXISTS', 'Este correo electrónico ya está registrado');
    }
    
    // Verificar si el CURP ya existe
    const existingCurp = await prisma.user.findUnique({
      where: { curp: input.curp.toUpperCase() },
    });
    if (existingCurp) {
      throw new AuthError('CURP_EXISTS', 'Este CURP ya está registrado');
    }
    
    // Validar formato de CURP
    if (!this.isValidCURP(input.curp)) {
      throw new AuthError('INVALID_CURP', 'El formato del CURP es inválido');
    }
    
    // Hash de la contraseña
    const passwordHash = await bcrypt.hash(input.password, 12);
    
    // Generar token de verificación
    const verificationToken = generateSecureToken(32);
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas
    
    // Crear usuario
    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash,
        curp: input.curp.toUpperCase(),
        name: input.name,
        phone: input.phone,
        dateOfBirth: input.dateOfBirth,
        sex: input.sex?.toUpperCase(),
        verificationToken,
        verificationExpires,
        // Crear perfil vacío
        profile: {
          create: {
            qrToken: uuidv4(),
          },
        },
      },
      include: {
        profile: true,
      },
    });
    
    // Generar tokens
    const tokens = await this.generateTokens(user);
    
    // TODO: Enviar email de verificación
    
    return { user, tokens };
  }
  
  /**
   * Inicia sesión de usuario
   */
  async login(input: LoginInput, ipAddress?: string, userAgent?: string): Promise<{ user: User; tokens: AuthTokens }> {
    // Buscar usuario
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { profile: true },
    });
    
    if (!user) {
      throw new AuthError('INVALID_CREDENTIALS', 'Credenciales inválidas');
    }
    
    if (!user.isActive) {
      throw new AuthError('ACCOUNT_DISABLED', 'Esta cuenta ha sido desactivada');
    }
    
    // Verificar contraseña
    const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw new AuthError('INVALID_CREDENTIALS', 'Credenciales inválidas');
    }
    
    // Generar tokens
    const tokens = await this.generateTokens(user);
    
    // Guardar sesión
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: tokens.refreshToken,
        ipAddress,
        userAgent,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
      },
    });
    
    // Actualizar último login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    
    return { user, tokens };
  }
  
  /**
   * Refresca el access token
   */
  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    // Verificar el refresh token
    let payload: TokenPayload;
    try {
      payload = jwt.verify(refreshToken, config.jwt.secret) as TokenPayload;
    } catch (error) {
      throw new AuthError('INVALID_TOKEN', 'Token de refresco inválido');
    }
    
    if (payload.type !== 'refresh') {
      throw new AuthError('INVALID_TOKEN', 'Tipo de token inválido');
    }
    
    // Buscar la sesión
    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });
    
    if (!session || session.expiresAt < new Date()) {
      throw new AuthError('SESSION_EXPIRED', 'La sesión ha expirado');
    }
    
    // Generar nuevos tokens
    const tokens = await this.generateTokens(session.user);
    
    // Actualizar el refresh token en la sesión
    await prisma.session.update({
      where: { id: session.id },
      data: {
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    
    return tokens;
  }
  
  /**
   * Cierra sesión
   */
  async logout(refreshToken: string): Promise<void> {
    await prisma.session.deleteMany({
      where: { refreshToken },
    });
  }
  
  /**
   * Cierra todas las sesiones del usuario
   */
  async logoutAll(userId: string): Promise<void> {
    await prisma.session.deleteMany({
      where: { userId },
    });
  }
  
  /**
   * Verifica el email del usuario
   */
  async verifyEmail(token: string): Promise<User> {
    const user = await prisma.user.findFirst({
      where: {
        verificationToken: token,
        verificationExpires: { gt: new Date() },
      },
    });
    
    if (!user) {
      throw new AuthError('INVALID_TOKEN', 'Token de verificación inválido o expirado');
    }
    
    return await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
        verificationExpires: null,
      },
    });
  }
  
  /**
   * Solicita recuperación de contraseña
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    
    if (!user) {
      // No revelar si el email existe
      return;
    }
    
    const resetToken = generateSecureToken(32);
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
    
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetExpires },
    });
    
    // TODO: Enviar email con link de recuperación
  }
  
  /**
   * Restablece la contraseña
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetExpires: { gt: new Date() },
      },
    });
    
    if (!user) {
      throw new AuthError('INVALID_TOKEN', 'Token de recuperación inválido o expirado');
    }
    
    const passwordHash = await bcrypt.hash(newPassword, 12);
    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetExpires: null,
      },
    });
    
    // Cerrar todas las sesiones
    await this.logoutAll(user.id);
  }
  
  /**
   * Verifica un access token y retorna el payload
   */
  verifyAccessToken(token: string): TokenPayload {
    try {
      const payload = jwt.verify(token, config.jwt.secret) as TokenPayload;
      if (payload.type !== 'access') {
        throw new AuthError('INVALID_TOKEN', 'Tipo de token inválido');
      }
      return payload;
    } catch (error) {
      throw new AuthError('INVALID_TOKEN', 'Token inválido o expirado');
    }
  }
  
  /**
   * Genera par de tokens (access y refresh)
   */
  private async generateTokens(user: User): Promise<AuthTokens> {
    const accessPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      type: 'access',
    };
    
    const refreshPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      type: 'refresh',
    };
    
    const accessToken = jwt.sign(accessPayload, config.jwt.secret, {
      expiresIn: config.jwt.accessExpiresIn,
    });
    
    const refreshToken = jwt.sign(refreshPayload, config.jwt.secret, {
      expiresIn: config.jwt.refreshExpiresIn,
    });
    
    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutos en segundos
    };
  }
  
  /**
   * Valida formato de CURP
   */
  private isValidCURP(curp: string): boolean {
    const curpRegex = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z][0-9]$/;
    return curpRegex.test(curp.toUpperCase());
  }
}

export const authService = new AuthService();
export default authService;
