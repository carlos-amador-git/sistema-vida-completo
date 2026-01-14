// src/modules/pup/pup.service.ts
import { PrismaClient, PatientProfile } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { encrypt, decrypt, encryptJSON, decryptJSON } from '../../common/utils/encryption';
import { generateEmergencyQR } from '../../common/utils/qr-generator';

const prisma = new PrismaClient();

// Tipos para datos médicos (descifrados)
interface MedicalData {
  allergies: string[];
  conditions: string[];
  medications: string[];
}

interface DonorPreferences {
  organs: string[];
  tissues: string[];
  forResearch: boolean;
  restrictions?: string;
}

interface ProfileInput {
  bloodType?: string;
  allergies?: string[];
  conditions?: string[];
  medications?: string[];
  insuranceProvider?: string;
  insurancePolicy?: string;
  insurancePhone?: string;
  isDonor?: boolean;
  donorPreferences?: DonorPreferences;
}

interface ProfileResponse {
  id: string;
  bloodType: string | null;
  allergies: string[];
  conditions: string[];
  medications: string[];
  insuranceProvider: string | null;
  insurancePolicy: string | null;
  insurancePhone: string | null;
  isDonor: boolean;
  donorPreferences: DonorPreferences | null;
  photoUrl: string | null;
  qrToken: string;
}

class PupService {
  /**
   * Obtiene el perfil del paciente (descifrado)
   */
  async getProfile(userId: string): Promise<ProfileResponse | null> {
    const profile = await prisma.patientProfile.findUnique({
      where: { userId },
    });
    
    if (!profile) {
      return null;
    }
    
    return this.decryptProfile(profile);
  }
  
  /**
   * Actualiza el perfil del paciente
   */
  async updateProfile(userId: string, input: ProfileInput): Promise<ProfileResponse> {
    // Cifrar datos sensibles
    const updateData: any = {};
    
    if (input.bloodType !== undefined) {
      updateData.bloodType = input.bloodType;
    }
    
    if (input.allergies !== undefined) {
      updateData.allergiesEnc = encryptJSON(input.allergies);
    }
    
    if (input.conditions !== undefined) {
      updateData.conditionsEnc = encryptJSON(input.conditions);
    }
    
    if (input.medications !== undefined) {
      updateData.medicationsEnc = encryptJSON(input.medications);
    }
    
    if (input.insuranceProvider !== undefined) {
      updateData.insuranceProvider = input.insuranceProvider;
    }
    
    if (input.insurancePolicy !== undefined) {
      updateData.insurancePolicy = input.insurancePolicy;
    }
    
    if (input.insurancePhone !== undefined) {
      updateData.insurancePhone = input.insurancePhone;
    }
    
    if (input.isDonor !== undefined) {
      updateData.isDonor = input.isDonor;
    }
    
    if (input.donorPreferences !== undefined) {
      updateData.donorPreferencesEnc = encryptJSON(input.donorPreferences);
    }
    
    const profile = await prisma.patientProfile.update({
      where: { userId },
      data: updateData,
    });
    
    return this.decryptProfile(profile);
  }
  
  /**
   * Actualiza la foto de perfil
   */
  async updatePhoto(userId: string, photoUrl: string): Promise<ProfileResponse> {
    const profile = await prisma.patientProfile.update({
      where: { userId },
      data: { photoUrl },
    });
    
    return this.decryptProfile(profile);
  }
  
  /**
   * Regenera el código QR
   */
  async regenerateQR(userId: string): Promise<{ qrToken: string; qrDataUrl: string }> {
    const newQrToken = uuidv4();
    
    await prisma.patientProfile.update({
      where: { userId },
      data: {
        qrToken: newQrToken,
        qrGeneratedAt: new Date(),
      },
    });
    
    const qrResult = await generateEmergencyQR(newQrToken);
    
    return {
      qrToken: newQrToken,
      qrDataUrl: qrResult.qrDataUrl,
    };
  }
  
  /**
   * Obtiene el código QR del usuario
   */
  async getQR(userId: string): Promise<{ qrToken: string; qrDataUrl: string; generatedAt: Date } | null> {
    const profile = await prisma.patientProfile.findUnique({
      where: { userId },
      select: { qrToken: true, qrGeneratedAt: true },
    });
    
    if (!profile) {
      return null;
    }
    
    const qrResult = await generateEmergencyQR(profile.qrToken);
    
    return {
      qrToken: profile.qrToken,
      qrDataUrl: qrResult.qrDataUrl,
      generatedAt: profile.qrGeneratedAt,
    };
  }
  
  /**
   * Obtiene perfil por QR token (para acceso de emergencia)
   * Solo retorna datos críticos
   */
  async getProfileByQRToken(qrToken: string): Promise<{
    userId: string;
    name: string;
    dateOfBirth: Date | null;
    sex: string | null;
    bloodType: string | null;
    allergies: string[];
    conditions: string[];
    medications: string[];
    isDonor: boolean;
    photoUrl: string | null;
  } | null> {
    const profile = await prisma.patientProfile.findUnique({
      where: { qrToken },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            dateOfBirth: true,
            sex: true,
          },
        },
      },
    });
    
    if (!profile) {
      return null;
    }
    
    return {
      userId: profile.user.id,
      name: profile.user.name,
      dateOfBirth: profile.user.dateOfBirth,
      sex: profile.user.sex,
      bloodType: profile.bloodType,
      allergies: profile.allergiesEnc ? decryptJSON<string[]>(profile.allergiesEnc) : [],
      conditions: profile.conditionsEnc ? decryptJSON<string[]>(profile.conditionsEnc) : [],
      medications: profile.medicationsEnc ? decryptJSON<string[]>(profile.medicationsEnc) : [],
      isDonor: profile.isDonor,
      photoUrl: profile.photoUrl,
    };
  }
  
  /**
   * Descifra un perfil de la base de datos
   */
  private decryptProfile(profile: PatientProfile): ProfileResponse {
    return {
      id: profile.id,
      bloodType: profile.bloodType,
      allergies: profile.allergiesEnc ? decryptJSON<string[]>(profile.allergiesEnc) : [],
      conditions: profile.conditionsEnc ? decryptJSON<string[]>(profile.conditionsEnc) : [],
      medications: profile.medicationsEnc ? decryptJSON<string[]>(profile.medicationsEnc) : [],
      insuranceProvider: profile.insuranceProvider,
      insurancePolicy: profile.insurancePolicy,
      insurancePhone: profile.insurancePhone,
      isDonor: profile.isDonor,
      donorPreferences: profile.donorPreferencesEnc 
        ? decryptJSON<DonorPreferences>(profile.donorPreferencesEnc) 
        : null,
      photoUrl: profile.photoUrl,
      qrToken: profile.qrToken,
    };
  }
}

export const pupService = new PupService();
export default pupService;
