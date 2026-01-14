// src/config/index.ts
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Entorno
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  
  // Base de datos
  database: {
    url: process.env.DATABASE_URL || 'postgresql://vida:vida_secret@localhost:5432/vida_db',
  },
  
  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    adminSecret: process.env.JWT_ADMIN_SECRET || 'admin-super-secret-jwt-key-change-in-production',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Admin settings
  admin: {
    maxLoginAttempts: 5,
    lockoutDurationMinutes: 30,
    sessionTimeoutMinutes: 60,
  },
  
  // Cifrado
  encryption: {
    key: process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  },
  
  // PSC NOM-151
  psc: {
    endpoint: process.env.PSC_ENDPOINT || 'https://api.psc-demo.mx/v1',
    apiKey: process.env.PSC_API_KEY || 'demo-key',
  },
  
  // Email (SendGrid/SMTP)
  email: {
    host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || 'apikey',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.EMAIL_FROM || 'noreply@vida.mx',
  },
  
  // SMS (Twilio)
  twilio: {
    sid: process.env.TWILIO_ACCOUNT_SID || '',
    token: process.env.TWILIO_AUTH_TOKEN || '',
    phone: process.env.TWILIO_PHONE_NUMBER || '',
  },
  
  // AWS S3
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    bucket: process.env.AWS_S3_BUCKET || 'vida-documents',
    region: process.env.AWS_REGION || 'us-east-1',
  },

  // Stripe - Pagos
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    currency: 'mxn',
  },

  // Facturama - CFDI
  facturama: {
    apiUrl: process.env.FACTURAMA_API_URL || 'https://apisandbox.facturama.mx',
    username: process.env.FACTURAMA_USERNAME || '',
    password: process.env.FACTURAMA_PASSWORD || '',
    expeditionZip: process.env.FACTURAMA_EXPEDITION_ZIP || '06600',
    // Datos del emisor (tu empresa)
    emisorRfc: process.env.FACTURAMA_EMISOR_RFC || '',
    emisorNombre: process.env.FACTURAMA_EMISOR_NOMBRE || 'Sistema VIDA',
    emisorRegimen: process.env.FACTURAMA_EMISOR_REGIMEN || '601', // General de Ley PM
  },

  // Frontend URL (para CORS y emails)
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // URLs permitidas para CORS (desarrollo)
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://189.137.0.35:5173', 'http://189.137.0.35:3001'],
  
  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // requests por ventana
  },
};

export default config;
