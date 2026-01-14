// src/main.ts
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';

import config from './config';

// Importar controladores
import authController from './modules/auth/auth.controller';
import pupController from './modules/pup/pup.controller';
import directivesController from './modules/directives/directives.controller';
import representativesController from './modules/representatives/representatives.controller';
import emergencyController from './modules/emergency/emergency.controller';
import hospitalController from './modules/hospital/hospital.controller';
import panicController from './modules/panic/panic.controller';
import insuranceController from './modules/insurance/insurance.controller';
import adminAuthController from './modules/admin/admin-auth.controller';
import adminController from './modules/admin/admin.controller';
import webauthnController from './modules/auth/webauthn.controller';
import paymentsController from './modules/payments/payments.controller';
import paymentsAdminController from './modules/payments/payments-admin.controller';
import paymentsWebhookController from './modules/payments/payments-webhook.controller';

// Socket.io
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// Inicializar Prisma
const prisma = new PrismaClient();

// Crear aplicación Express
const app = express();

// Crear servidor HTTP para Socket.io
const httpServer = createServer(app);

// Configurar Socket.io
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Exportar io para uso en otros modulos
export { io };

// ==================== MIDDLEWARE GLOBAL ====================

// Seguridad
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS - permitir múltiples orígenes en desarrollo
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Compresión
app.use(compression());

// Logging
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

// IMPORTANTE: Webhook de Stripe necesita body raw (antes de express.json)
app.use('/api/v1/webhooks/stripe', express.raw({ type: 'application/json' }), paymentsWebhookController);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting global
const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Demasiadas solicitudes. Por favor, intente más tarde.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// Rate limiting estricto para autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: config.env === 'development' ? 100 : 10, // Más permisivo en desarrollo
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT',
      message: 'Demasiados intentos de autenticación. Por favor, espere 15 minutos.',
    },
  },
});

// ==================== RUTAS DE SALUD ====================

app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: config.env,
  });
});

app.get('/api/v1/health', async (req: Request, res: Response) => {
  try {
    // Verificar conexión a la base de datos
    await prisma.$queryRaw`SELECT 1`;
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        database: 'connected',
        api: 'running',
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'disconnected',
        api: 'running',
      },
    });
  }
});

// ==================== RUTAS DE API ====================

// Autenticación (con rate limiting estricto)
app.use('/api/v1/auth', authLimiter, authController);

// WebAuthn / Biometría (con rate limiting)
app.use('/api/v1/auth/webauthn', authLimiter, webauthnController);

// Perfil del paciente
app.use('/api/v1/profile', pupController);

// Directivas de voluntad anticipada
app.use('/api/v1/directives', directivesController);

// Representantes
app.use('/api/v1/representatives', representativesController);

// Acceso de emergencia
app.use('/api/v1/emergency', emergencyController);

// Hospitales
app.use('/api/v1/hospitals', hospitalController);

// Aseguradoras (público para selector de perfil)
app.use('/api/v1/insurance', insuranceController);

// Alertas de panico
app.use('/api/v1/emergency/panic', panicController);

// Pagos y suscripciones
app.use('/api/v1/payments', paymentsController);

// ==================== RUTAS DE ADMINISTRACION ====================

// Autenticacion de administradores (con rate limiting)
app.use('/api/v1/admin/auth', authLimiter, adminAuthController);

// Endpoints de administracion (requieren auth admin)
app.use('/api/v1/admin', adminController);

// Administracion de pagos y suscripciones
app.use('/api/v1/admin/payments', paymentsAdminController);

// ==================== MANEJO DE ERRORES ====================

// Ruta no encontrada
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Ruta ${req.method} ${req.path} no encontrada`,
    },
  });
});

// Error handler global
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error no manejado:', err);
  
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: config.env === 'production' 
        ? 'Error interno del servidor' 
        : err.message,
    },
  });
});

// ==================== INICIAR SERVIDOR ====================

const startServer = async () => {
  try {
    // Conectar a la base de datos
    await prisma.$connect();
    console.log('✅ Conectado a la base de datos PostgreSQL');

    // Configurar eventos de Socket.io
    io.on('connection', (socket) => {
      console.log(`🔌 Cliente conectado: ${socket.id}`);

      // Unirse a una sala por userId (para recibir alertas)
      socket.on('join-user', (userId: string) => {
        socket.join(`user-${userId}`);
        console.log(`👤 Usuario ${userId} unido a su sala`);
      });

      // Unirse a sala de representante
      socket.on('join-representative', (userId: string) => {
        socket.join(`representative-${userId}`);
        console.log(`👥 Representante unido a sala de usuario ${userId}`);
      });

      socket.on('disconnect', () => {
        console.log(`🔌 Cliente desconectado: ${socket.id}`);
      });
    });

    // Iniciar servidor HTTP con Socket.io
    httpServer.listen(config.port, config.host, () => {
      console.log(`
 ╔═══════════════════════════════════════════════════════════════╗
 ║                                                               ║
 ║   🏥 Sistema VIDA - Backend API                              ║
 ║   Vinculación de Información para Decisiones y Alertas       ║
 ║                                                               ║
 ║   🌐 Servidor: http://${config.host}:${config.port}                     ║
 ║   📚 API Base: http://${config.host}:${config.port}/api/v1              ║
 ║   🔌 WebSocket: ws://${config.host}:${config.port}                      ║
 ║   🔧 Entorno: ${config.env.padEnd(42)}║
 ║                                                               ║
 ╚═══════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('❌ Error iniciando el servidor:', error);
    process.exit(1);
  }
};

// Manejo de señales de terminación
process.on('SIGINT', async () => {
  console.log('\n🛑 Cerrando servidor...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Cerrando servidor...');
  await prisma.$disconnect();
  process.exit(0);
});

// Iniciar
startServer();

export default app;
