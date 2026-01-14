// src/modules/insurance/insurance.controller.ts
import { Router, Request, Response } from 'express';
import { insuranceService } from './insurance.service';

const router = Router();

/**
 * GET /api/v1/insurance/options
 * Obtiene lista de aseguradoras para selector (público)
 */
router.get('/options', async (req: Request, res: Response) => {
  try {
    const insurances = await insuranceService.getInsuranceOptions();

    // Agrupar por tipo para el frontend
    const grouped = {
      HEALTH: insurances.filter(i => i.type === 'HEALTH'),
      HEALTH_LIFE: insurances.filter(i => i.type === 'HEALTH_LIFE'),
      ACCIDENT: insurances.filter(i => i.type === 'ACCIDENT'),
      OTHER: insurances.filter(i => !['HEALTH', 'HEALTH_LIFE', 'ACCIDENT'].includes(i.type)),
    };

    res.json({
      success: true,
      data: {
        insurances,
        grouped,
        total: insurances.length,
      },
    });
  } catch (error) {
    console.error('Error obteniendo aseguradoras:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Error al obtener lista de aseguradoras',
      },
    });
  }
});

/**
 * GET /api/v1/insurance/:shortName/network
 * Obtiene hospitales en red de una aseguradora (público)
 */
router.get('/:shortName/network', async (req: Request, res: Response) => {
  try {
    const { shortName } = req.params;

    const result = await insuranceService.getNetworkHospitals(shortName);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Aseguradora no encontrada',
        },
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error obteniendo red de hospitales:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Error al obtener red de hospitales',
      },
    });
  }
});

/**
 * GET /api/v1/insurance/:shortName
 * Obtiene detalles de una aseguradora (público)
 */
router.get('/:shortName', async (req: Request, res: Response) => {
  try {
    const { shortName } = req.params;

    const insurance = await insuranceService.getInsuranceDetail(shortName);

    if (!insurance) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Aseguradora no encontrada',
        },
      });
    }

    res.json({
      success: true,
      data: { insurance },
    });
  } catch (error) {
    console.error('Error obteniendo detalles de aseguradora:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Error al obtener detalles de aseguradora',
      },
    });
  }
});

export default router;
