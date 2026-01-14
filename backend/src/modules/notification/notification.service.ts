// src/modules/notification/notification.service.ts
import twilio from 'twilio';
import nodemailer from 'nodemailer';
import { PrismaClient, NotificationType, NotificationChannel, NotificationStatus } from '@prisma/client';
import config from '../../config';
import { getGoogleMapsUrl } from '../../common/utils/geolocation';

const prisma = new PrismaClient();

interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface NotificationResult {
  representativeId: string;
  name: string;
  phone: string;
  email?: string;
  smsStatus: 'sent' | 'failed' | 'skipped';
  emailStatus: 'sent' | 'failed' | 'skipped';
  messageId?: string;
  error?: string;
}

class NotificationService {
  private twilioClient: twilio.Twilio | null = null;
  private emailTransporter: nodemailer.Transporter | null = null;
  private isSimulationMode: boolean = false;

  constructor() {
    this.initializeTwilio();
    this.initializeEmail();
  }

  private initializeTwilio(): void {
    const { sid, token, phone } = config.twilio;

    if (sid && token && phone) {
      try {
        this.twilioClient = twilio(sid, token);
        console.log('Twilio inicializado correctamente');
      } catch (error) {
        console.warn('Error inicializando Twilio:', error);
        this.isSimulationMode = true;
      }
    } else {
      console.warn('Credenciales de Twilio no configuradas. Usando modo simulacion.');
      this.isSimulationMode = true;
    }
  }

  private initializeEmail(): void {
    const { host, port, user, password } = config.email;

    if (host && user && password) {
      this.emailTransporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass: password,
        },
      });
    }
  }

  /**
   * Envia SMS de emergencia via Twilio
   */
  async sendEmergencySMS(params: {
    to: string;
    patientName: string;
    location: { lat: number; lng: number };
    type: 'PANIC' | 'QR_ACCESS';
    accessorName?: string;
    nearestHospital?: string;
  }): Promise<SMSResult> {
    const { to, patientName, location, type, accessorName, nearestHospital } = params;

    // Construir mensaje segun el tipo
    let message: string;
    const mapsUrl = getGoogleMapsUrl(location.lat, location.lng);

    if (type === 'PANIC') {
      message = `ALERTA VIDA - EMERGENCIA\n\n${patientName} ha activado el boton de panico.\n\nUbicacion: ${mapsUrl}\n\n${nearestHospital ? `Hospital mas cercano: ${nearestHospital}` : ''}\n\nPor favor, contacte inmediatamente.`;
    } else {
      message = `ALERTA VIDA\n\nSe ha accedido a la informacion medica de ${patientName}.\n\nAcceso por: ${accessorName || 'Personal medico'}\nUbicacion: ${mapsUrl}\n\n${nearestHospital ? `Hospital cercano: ${nearestHospital}` : ''}\n\nEste es un acceso autorizado de emergencia.`;
    }

    // Modo simulacion
    if (this.isSimulationMode || !this.twilioClient) {
      console.log('=== SMS SIMULADO ===');
      console.log(`Para: ${to}`);
      console.log(`Mensaje: ${message}`);
      console.log('====================');

      // Registrar en BD como simulado
      await this.saveNotification({
        phone: to,
        type: type === 'PANIC' ? NotificationType.EMERGENCY_ALERT : NotificationType.ACCESS_NOTIFICATION,
        channel: NotificationChannel.SMS,
        body: message,
        status: NotificationStatus.SENT,
        metadata: { simulated: true, location },
      });

      return { success: true, messageId: `SIM-${Date.now()}` };
    }

    // Envio real via Twilio
    try {
      const result = await this.twilioClient.messages.create({
        body: message,
        from: config.twilio.phone,
        to: this.formatPhoneNumber(to),
      });

      // Registrar en BD
      await this.saveNotification({
        phone: to,
        type: type === 'PANIC' ? NotificationType.EMERGENCY_ALERT : NotificationType.ACCESS_NOTIFICATION,
        channel: NotificationChannel.SMS,
        body: message,
        status: NotificationStatus.SENT,
        metadata: { twilioSid: result.sid, location },
      });

      return { success: true, messageId: result.sid };
    } catch (error: any) {
      console.error('Error enviando SMS:', error);

      // Registrar fallo en BD
      await this.saveNotification({
        phone: to,
        type: type === 'PANIC' ? NotificationType.EMERGENCY_ALERT : NotificationType.ACCESS_NOTIFICATION,
        channel: NotificationChannel.SMS,
        body: message,
        status: NotificationStatus.FAILED,
        errorMessage: error.message,
        metadata: { location },
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Envia email de emergencia
   */
  async sendEmergencyEmail(params: {
    to: string;
    patientName: string;
    location: { lat: number; lng: number };
    type: 'PANIC' | 'QR_ACCESS';
    accessorName?: string;
    nearestHospital?: string;
    nearbyHospitals?: Array<{ name: string; distance: number; phone?: string }>;
  }): Promise<EmailResult> {
    const { to, patientName, location, type, accessorName, nearestHospital, nearbyHospitals } = params;

    const mapsUrl = getGoogleMapsUrl(location.lat, location.lng);
    const isPanic = type === 'PANIC';

    const subject = isPanic
      ? `🚨 ALERTA EMERGENCIA - ${patientName} ha activado el botón de pánico`
      : `⚠️ ALERTA VIDA - Acceso a información médica de ${patientName}`;

    // Construir lista de hospitales para el email
    let hospitalsHtml = '';
    if (nearbyHospitals && nearbyHospitals.length > 0) {
      hospitalsHtml = `
        <h3 style="color: #0284c7; margin-top: 20px;">Hospitales Cercanos:</h3>
        <table style="width: 100%; border-collapse: collapse;">
          ${nearbyHospitals.map(h => `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px 0;">
                <strong>${h.name}</strong><br>
                <span style="color: #6b7280; font-size: 14px;">A ${h.distance.toFixed(1)} km</span>
              </td>
              <td style="text-align: right; padding: 10px 0;">
                ${h.phone ? `<a href="tel:${h.phone}" style="background: #dc2626; color: white; padding: 8px 16px; border-radius: 20px; text-decoration: none;">Llamar</a>` : ''}
              </td>
            </tr>
          `).join('')}
        </table>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f3f4f6;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

          <!-- Header -->
          <div style="background: ${isPanic ? '#dc2626' : '#f59e0b'}; color: white; padding: 24px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">${isPanic ? '🚨 EMERGENCIA' : '⚠️ ALERTA VIDA'}</h1>
          </div>

          <!-- Content -->
          <div style="padding: 24px;">
            <p style="font-size: 18px; color: #1f2937; margin-bottom: 20px;">
              ${isPanic
                ? `<strong>${patientName}</strong> ha activado el botón de pánico y necesita ayuda inmediata.`
                : `Se ha accedido a la información médica de <strong>${patientName}</strong>.`
              }
            </p>

            ${!isPanic && accessorName ? `
              <p style="color: #6b7280;">
                <strong>Acceso realizado por:</strong> ${accessorName}
              </p>
            ` : ''}

            <!-- Location -->
            <div style="background: #f9fafb; border-radius: 12px; padding: 16px; margin: 20px 0;">
              <h3 style="color: #374151; margin: 0 0 10px 0;">📍 Ubicación</h3>
              <a href="${mapsUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                Ver en Google Maps
              </a>
              ${nearestHospital ? `<p style="color: #6b7280; margin-top: 10px;">Hospital más cercano: <strong>${nearestHospital}</strong></p>` : ''}
            </div>

            ${hospitalsHtml}

            <!-- Footer -->
            <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 14px; margin: 0;">
                Este mensaje fue enviado automáticamente por el Sistema VIDA.<br>
                ${new Date().toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })}
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Modo simulación si no hay transporter
    if (!this.emailTransporter) {
      console.log('=== EMAIL SIMULADO ===');
      console.log(`Para: ${to}`);
      console.log(`Asunto: ${subject}`);
      console.log('======================');

      await this.saveNotification({
        email: to,
        type: isPanic ? NotificationType.EMERGENCY_ALERT : NotificationType.ACCESS_NOTIFICATION,
        channel: NotificationChannel.EMAIL,
        subject,
        body: html,
        status: NotificationStatus.SENT,
        metadata: { simulated: true, location },
      });

      return { success: true, messageId: `SIM-EMAIL-${Date.now()}` };
    }

    // Envío real
    try {
      const result = await this.emailTransporter.sendMail({
        from: config.email.from,
        to,
        subject,
        html,
      });

      await this.saveNotification({
        email: to,
        type: isPanic ? NotificationType.EMERGENCY_ALERT : NotificationType.ACCESS_NOTIFICATION,
        channel: NotificationChannel.EMAIL,
        subject,
        body: html,
        status: NotificationStatus.SENT,
        metadata: { messageId: result.messageId, location },
      });

      return { success: true, messageId: result.messageId };
    } catch (error: any) {
      console.error('Error enviando email:', error);

      await this.saveNotification({
        email: to,
        type: isPanic ? NotificationType.EMERGENCY_ALERT : NotificationType.ACCESS_NOTIFICATION,
        channel: NotificationChannel.EMAIL,
        subject,
        body: html,
        status: NotificationStatus.FAILED,
        errorMessage: error.message,
        metadata: { location },
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Notifica a todos los representantes de un usuario (SMS + Email)
   */
  async notifyAllRepresentatives(params: {
    userId: string;
    patientName: string;
    type: 'PANIC' | 'QR_ACCESS';
    location: { lat: number; lng: number };
    accessorName?: string;
    nearestHospital?: string;
    nearbyHospitals?: Array<{ name: string; distance: number; phone?: string }>;
  }): Promise<NotificationResult[]> {
    const { userId, patientName, type, location, accessorName, nearestHospital, nearbyHospitals } = params;

    // Obtener representantes con notificacion activada
    const representatives = await prisma.representative.findMany({
      where: {
        userId,
        notifyOnEmergency: true,
      },
      orderBy: { priority: 'asc' },
    });

    if (representatives.length === 0) {
      console.log('No hay representantes configurados para notificar');
      return [];
    }

    const results: NotificationResult[] = [];

    for (const rep of representatives) {
      // Enviar SMS
      const smsResult = await this.sendEmergencySMS({
        to: rep.phone,
        patientName,
        location,
        type,
        accessorName,
        nearestHospital,
      });

      // Enviar Email si tiene email configurado
      let emailResult: EmailResult = { success: false };
      if (rep.email) {
        emailResult = await this.sendEmergencyEmail({
          to: rep.email,
          patientName,
          location,
          type,
          accessorName,
          nearestHospital,
          nearbyHospitals,
        });
      }

      results.push({
        representativeId: rep.id,
        name: rep.name,
        phone: rep.phone,
        email: rep.email || undefined,
        smsStatus: smsResult.success ? 'sent' : 'failed',
        emailStatus: rep.email ? (emailResult.success ? 'sent' : 'failed') : 'skipped',
        messageId: smsResult.messageId,
        error: smsResult.error || emailResult.error,
      });
    }

    return results;
  }

  /**
   * Guarda una notificacion en la base de datos
   */
  private async saveNotification(data: {
    userId?: string;
    email?: string;
    phone?: string;
    type: NotificationType;
    channel: NotificationChannel;
    subject?: string;
    body: string;
    status: NotificationStatus;
    errorMessage?: string;
    metadata?: any;
  }): Promise<void> {
    try {
      await prisma.notification.create({
        data: {
          userId: data.userId,
          email: data.email,
          phone: data.phone,
          type: data.type,
          channel: data.channel,
          subject: data.subject,
          body: data.body,
          status: data.status,
          errorMessage: data.errorMessage,
          metadata: data.metadata,
          sentAt: data.status === NotificationStatus.SENT ? new Date() : null,
          failedAt: data.status === NotificationStatus.FAILED ? new Date() : null,
        },
      });
    } catch (error) {
      console.error('Error guardando notificacion en BD:', error);
    }
  }

  /**
   * Formatea numero de telefono para Twilio (E.164)
   */
  private formatPhoneNumber(phone: string): string {
    // Remover espacios y caracteres especiales
    let cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

    // Si no empieza con +, asumir Mexico (+52)
    if (!cleaned.startsWith('+')) {
      if (cleaned.startsWith('52')) {
        cleaned = '+' + cleaned;
      } else {
        cleaned = '+52' + cleaned;
      }
    }

    return cleaned;
  }

  /**
   * Verifica si el servicio esta en modo simulacion
   */
  isInSimulationMode(): boolean {
    return this.isSimulationMode;
  }
}

export const notificationService = new NotificationService();
export default notificationService;
