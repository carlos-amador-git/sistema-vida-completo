// src/modules/emergency/emergency.service.ts
import { PrismaClient, EmergencyAccess } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { pupService } from '../pup/pup.service';
import { directivesService } from '../directives/directives.service';
import { notificationService } from '../notification/notification.service';
import { hospitalService } from '../hospital/hospital.service';
import { io } from '../../main';

const prisma = new PrismaClient();

// Tipos
interface EmergencyAccessInput {
  qrToken: string;
  accessorName: string;
  accessorRole: string;
  accessorLicense?: string;
  institutionId?: string;
  institutionName?: string;
  ipAddress?: string;
  userAgent?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
}

interface EmergencyDataResponse {
  accessToken: string;
  expiresAt: Date;
  patient: {
    name: string;
    dateOfBirth: Date | null;
    sex: string | null;
    photoUrl: string | null;
  };
  medicalInfo: {
    bloodType: string | null;
    allergies: string[];
    conditions: string[];
    medications: string[];
  };
  directive: {
    hasActiveDirective: boolean;
    acceptsCPR: boolean | null;
    acceptsIntubation: boolean | null;
    additionalNotes: string | null;
    documentUrl: string | null;
    validatedAt: Date | null;
  };
  donation: {
    isDonor: boolean;
  };
  representatives: {
    name: string;
    phone: string;
    relation: string;
    priority: number;
  }[];
}

class EmergencyService {
  /**
   * Inicia un acceso de emergencia escaneando el QR
   */
  async initiateEmergencyAccess(input: EmergencyAccessInput): Promise<EmergencyDataResponse | null> {
    // Buscar el perfil por QR token
    const profileData = await pupService.getProfileByQRToken(input.qrToken);
    
    if (!profileData) {
      return null;
    }
    
    // Obtener directivas activas
    const directiveData = await directivesService.getDirectivesForEmergency(profileData.userId);
    
    // Obtener representantes
    const representatives = await prisma.representative.findMany({
      where: { userId: profileData.userId },
      orderBy: { priority: 'asc' },
      select: {
        name: true,
        phone: true,
        relation: true,
        priority: true,
      },
    });
    
    // Crear token de acceso temporal (60 minutos)
    const accessToken = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    
    // Registrar el acceso
    const emergencyAccess = await prisma.emergencyAccess.create({
      data: {
        patientId: profileData.userId,
        accessorName: input.accessorName,
        accessorRole: input.accessorRole,
        accessorLicense: input.accessorLicense,
        institutionId: input.institutionId,
        institutionName: input.institutionName,
        qrTokenUsed: input.qrToken,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        latitude: input.latitude,
        longitude: input.longitude,
        locationName: input.locationName,
        dataAccessed: ['profile', 'allergies', 'conditions', 'medications', 'directives', 'representatives'],
        accessToken,
        expiresAt,
      },
    });
    
    // Registrar en auditoría
    await prisma.auditLog.create({
      data: {
        userId: profileData.userId,
        actorType: 'STAFF',
        actorName: input.accessorName,
        action: 'EMERGENCY_ACCESS',
        resource: 'patient_data',
        resourceId: profileData.userId,
        details: {
          accessorRole: input.accessorRole,
          institutionName: input.institutionName,
          location: input.locationName,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
    
    // Notificar a representantes via SMS y WebSocket
    this.notifyRepresentatives(profileData.userId, input.accessorName, {
      lat: input.latitude,
      lng: input.longitude,
      name: input.locationName,
    });
    
    return {
      accessToken,
      expiresAt,
      patient: {
        name: profileData.name,
        dateOfBirth: profileData.dateOfBirth,
        sex: profileData.sex,
        photoUrl: profileData.photoUrl,
      },
      medicalInfo: {
        bloodType: profileData.bloodType,
        allergies: profileData.allergies,
        conditions: profileData.conditions,
        medications: profileData.medications,
      },
      directive: directiveData || {
        hasActiveDirective: false,
        acceptsCPR: null,
        acceptsIntubation: null,
        additionalNotes: null,
        documentUrl: null,
        validatedAt: null,
      },
      donation: {
        isDonor: profileData.isDonor,
      },
      representatives,
    };
  }
  
  /**
   * Verifica si un token de acceso de emergencia es válido
   */
  async verifyAccessToken(accessToken: string): Promise<EmergencyAccess | null> {
    const access = await prisma.emergencyAccess.findUnique({
      where: { accessToken },
    });
    
    if (!access || access.expiresAt < new Date()) {
      return null;
    }
    
    return access;
  }
  
  /**
   * Obtiene el historial de accesos de emergencia del paciente
   */
  async getAccessHistory(userId: string): Promise<EmergencyAccess[]> {
    return await prisma.emergencyAccess.findMany({
      where: { patientId: userId },
      orderBy: { accessedAt: 'desc' },
      include: {
        institution: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    });
  }
  
  /**
   * Registra una institución médica
   */
  async registerInstitution(data: {
    name: string;
    type: string;
    cluesCode?: string;
    address?: string;
    city?: string;
    state?: string;
    phone?: string;
    email?: string;
  }) {
    return await prisma.medicalInstitution.create({
      data: {
        name: data.name,
        type: data.type as any,
        cluesCode: data.cluesCode,
        address: data.address,
        city: data.city,
        state: data.state,
        phone: data.phone,
        email: data.email,
      },
    });
  }
  
  /**
   * Notifica a los representantes sobre el acceso de emergencia
   * Envía SMS y Email reales, y emite eventos WebSocket
   * Usa búsqueda inteligente de hospitales basada en condiciones del paciente
   */
  private async notifyRepresentatives(
    userId: string,
    accessorName: string,
    location?: { lat?: number; lng?: number; name?: string }
  ): Promise<void> {
    // Obtener datos del usuario con su perfil médico
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        profile: {
          select: {
            conditionsEnc: true,
          },
        },
      },
    });

    if (!user) {
      console.error('Usuario no encontrado para notificación');
      return;
    }

    // Obtener condiciones del paciente (descifradas)
    const patientProfile = await pupService.getProfileByUserId(userId);
    const patientConditions = patientProfile?.conditions || [];

    // Buscar hospitales cercanos usando filtro inteligente
    let nearestHospital: string | undefined;
    let nearbyHospitals: Array<{ name: string; distance: number; phone?: string; matchScore?: number }> = [];

    if (location?.lat && location?.lng) {
      // Usar búsqueda inteligente si hay condiciones conocidas
      if (patientConditions.length > 0) {
        const hospitals = await hospitalService.findNearbyHospitalsForConditions({
          latitude: location.lat,
          longitude: location.lng,
          patientConditions,
          limit: 5,
          radiusKm: 20,
          prioritizeByCondition: true,
        });
        nearbyHospitals = hospitals.map(h => ({
          name: h.name,
          distance: h.distance,
          phone: h.emergencyPhone || h.phone || undefined,
          matchScore: h.matchScore,
        }));
        nearestHospital = hospitals[0]?.name;
      } else {
        // Búsqueda normal si no hay condiciones
        const hospitals = await hospitalService.findNearbyHospitals({
          latitude: location.lat,
          longitude: location.lng,
          limit: 5,
          radiusKm: 20,
        });
        nearbyHospitals = hospitals.map(h => ({
          name: h.name,
          distance: h.distance,
          phone: h.emergencyPhone || h.phone || undefined,
        }));
        nearestHospital = hospitals[0]?.name;
      }
    }

    // Enviar notificaciones SMS y Email a representantes
    const notificationResults = await notificationService.notifyAllRepresentatives({
      userId,
      patientName: user.name,
      type: 'QR_ACCESS',
      location: {
        lat: location?.lat || 0,
        lng: location?.lng || 0,
      },
      accessorName,
      nearestHospital,
      nearbyHospitals,
    });

    // Emitir evento WebSocket a representantes conectados
    const alertData = {
      type: 'QR_ACCESS_ALERT',
      patientName: user.name,
      patientId: userId,
      accessorName,
      location: location?.name || 'Ubicación no disponible',
      nearestHospital,
      nearbyHospitals,
      patientConditions,
      timestamp: new Date(),
    };

    io.to(`representative-${userId}`).emit('qr-access-alert', alertData);
    io.to(`user-${userId}`).emit('qr-access-notification', alertData);

    console.log(`📱 Notificación de acceso QR enviada:`);
    console.log(`  Paciente: ${user.name}`);
    console.log(`  Condiciones: ${patientConditions.join(', ') || 'Ninguna'}`);
    console.log(`  Acceso por: ${accessorName}`);
    console.log(`  Hospital recomendado: ${nearestHospital || 'N/A'}`);
    console.log(`  Representantes notificados: ${notificationResults.length}`);
    notificationResults.forEach((r) => {
      console.log(`    - ${r.name}: SMS=${r.smsStatus}, Email=${r.emailStatus}`);
    });
  }
}

export const emergencyService = new EmergencyService();
export default emergencyService;
