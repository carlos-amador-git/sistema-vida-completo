// src/components/admin/pages/AdminInstitutions.tsx
import React, { useState, useEffect } from 'react';
import {
  listInstitutions,
  listInsurance,
  verifyInstitution,
  verifyInsurance,
  getInstitutionStats,
  getInsuranceStats,
} from '../../../services/adminApi';
import {
  MedicalInstitution,
  InsuranceCompany,
  Pagination,
  InstitutionStats,
  InsuranceStats,
  INSURANCE_TYPE_LABELS,
  INSURANCE_TYPE_COLORS,
  InsuranceType,
} from '../../../types/admin';

type TabType = 'hospitals' | 'insurance';

const INSTITUTION_TYPE_LABELS: Record<string, string> = {
  HOSPITAL_PUBLIC: 'Hospital Publico',
  HOSPITAL_PRIVATE: 'Hospital Privado',
  CLINIC: 'Clinica',
  AMBULANCE_SERVICE: 'Ambulancias',
  IMSS: 'IMSS',
  ISSSTE: 'ISSSTE',
  OTHER: 'Otro',
};

const AdminInstitutions: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('hospitals');

  // Hospitals state
  const [hospitals, setHospitals] = useState<MedicalInstitution[]>([]);
  const [hospitalPagination, setHospitalPagination] = useState<Pagination | null>(null);
  const [hospitalStats, setHospitalStats] = useState<InstitutionStats | null>(null);
  const [hospitalSearch, setHospitalSearch] = useState('');
  const [hospitalPage, setHospitalPage] = useState(1);

  // Insurance state
  const [insurances, setInsurances] = useState<InsuranceCompany[]>([]);
  const [insurancePagination, setInsurancePagination] = useState<Pagination | null>(null);
  const [insuranceStats, setInsuranceStats] = useState<InsuranceStats | null>(null);
  const [insuranceSearch, setInsuranceSearch] = useState('');
  const [insurancePage, setInsurancePage] = useState(1);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (activeTab === 'hospitals') {
      loadHospitals();
      loadHospitalStats();
    } else {
      loadInsurances();
      loadInsuranceStats();
    }
  }, [activeTab, hospitalPage, insurancePage]);

  const loadHospitals = async () => {
    try {
      setIsLoading(true);
      const { institutions, pagination } = await listInstitutions({
        page: hospitalPage,
        limit: 15,
        search: hospitalSearch || undefined,
        sortBy: 'name',
        sortOrder: 'asc',
      });
      setHospitals(institutions);
      setHospitalPagination(pagination);
    } catch (error) {
      console.error('Error loading hospitals:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadHospitalStats = async () => {
    try {
      const stats = await getInstitutionStats();
      setHospitalStats(stats);
    } catch (error) {
      console.error('Error loading hospital stats:', error);
    }
  };

  const loadInsurances = async () => {
    try {
      setIsLoading(true);
      const { insurances: data, pagination } = await listInsurance({
        page: insurancePage,
        limit: 15,
        search: insuranceSearch || undefined,
        sortBy: 'name',
        sortOrder: 'asc',
      });
      setInsurances(data);
      setInsurancePagination(pagination);
    } catch (error) {
      console.error('Error loading insurances:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadInsuranceStats = async () => {
    try {
      const stats = await getInsuranceStats();
      setInsuranceStats(stats);
    } catch (error) {
      console.error('Error loading insurance stats:', error);
    }
  };

  const handleHospitalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setHospitalPage(1);
    loadHospitals();
  };

  const handleInsuranceSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setInsurancePage(1);
    loadInsurances();
  };

  const handleVerifyHospital = async (id: string, verified: boolean) => {
    try {
      await verifyInstitution(id, verified);
      loadHospitals();
      loadHospitalStats();
    } catch (error) {
      console.error('Error verifying hospital:', error);
    }
  };

  const handleVerifyInsurance = async (id: string, verified: boolean) => {
    try {
      await verifyInsurance(id, verified);
      loadInsurances();
      loadInsuranceStats();
    } catch (error) {
      console.error('Error verifying insurance:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Instituciones</h1>
        <p className="text-gray-500">Gestion de hospitales y aseguradoras</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('hospitals')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'hospitals'
                ? 'border-sky-500 text-sky-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Hospitales
              {hospitalStats && (
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                  {hospitalStats.total}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('insurance')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'insurance'
                ? 'border-sky-500 text-sky-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Aseguradoras
              {insuranceStats && (
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                  {insuranceStats.total}
                </span>
              )}
            </span>
          </button>
        </nav>
      </div>

      {/* Hospitals Tab */}
      {activeTab === 'hospitals' && (
        <div className="space-y-6">
          {/* Stats */}
          {hospitalStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Hospitales" value={hospitalStats.total} color="blue" />
              <StatCard label="Verificados" value={hospitalStats.verified} color="green" />
              <StatCard label="Con Urgencias" value={hospitalStats.withEmergency} color="red" />
              <StatCard label="24 Horas" value={hospitalStats.with24Hours} color="purple" />
            </div>
          )}

          {/* Search */}
          <form onSubmit={handleHospitalSearch} className="flex gap-4">
            <input
              type="text"
              placeholder="Buscar por nombre, CLUES, ciudad..."
              value={hospitalSearch}
              onChange={(e) => setHospitalSearch(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            />
            <button
              type="submit"
              className="px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700"
            >
              Buscar
            </button>
          </form>

          {/* Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mx-auto"></div>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ubicacion</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Servicios</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {hospitals.map((hospital) => (
                    <tr key={hospital.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{hospital.name}</p>
                          {hospital.cluesCode && (
                            <p className="text-sm text-gray-500">CLUES: {hospital.cluesCode}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {INSTITUTION_TYPE_LABELS[hospital.type] || hospital.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-600">{hospital.city}, {hospital.state}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          {hospital.hasEmergency && (
                            <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">Urgencias</span>
                          )}
                          {hospital.has24Hours && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">24h</span>
                          )}
                          {hospital.hasICU && (
                            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">UCI</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {hospital.isVerified ? (
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Verificado</span>
                        ) : (
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full">Pendiente</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleVerifyHospital(hospital.id, !hospital.isVerified)}
                          className={`text-sm ${hospital.isVerified ? 'text-yellow-600 hover:text-yellow-800' : 'text-green-600 hover:text-green-800'}`}
                        >
                          {hospital.isVerified ? 'Quitar verificacion' : 'Verificar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Pagination */}
            {hospitalPagination && hospitalPagination.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Mostrando {((hospitalPage - 1) * 15) + 1} - {Math.min(hospitalPage * 15, hospitalPagination.total)} de {hospitalPagination.total}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setHospitalPage(p => Math.max(1, p - 1))}
                    disabled={hospitalPage === 1}
                    className="px-3 py-1 border rounded disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setHospitalPage(p => Math.min(hospitalPagination.totalPages, p + 1))}
                    disabled={hospitalPage === hospitalPagination.totalPages}
                    className="px-3 py-1 border rounded disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Insurance Tab */}
      {activeTab === 'insurance' && (
        <div className="space-y-6">
          {/* Stats */}
          {insuranceStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Aseguradoras" value={insuranceStats.total} color="blue" />
              <StatCard label="Verificadas" value={insuranceStats.verified} color="green" />
              <StatCard label="Cobertura Nacional" value={insuranceStats.withNationalCoverage} color="purple" />
              <StatCard label="Planes Activos" value={insuranceStats.totalPlans} color="orange" />
            </div>
          )}

          {/* Search */}
          <form onSubmit={handleInsuranceSearch} className="flex gap-4">
            <input
              type="text"
              placeholder="Buscar por nombre, RFC, CNSF..."
              value={insuranceSearch}
              onChange={(e) => setInsuranceSearch(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            />
            <button
              type="submit"
              className="px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700"
            >
              Buscar
            </button>
          </form>

          {/* Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mx-auto"></div>
              </div>
            ) : insurances.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <p>No hay aseguradoras registradas</p>
                <p className="text-sm mt-2">Ejecuta el seed para agregar datos de prueba</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cobertura</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Red</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {insurances.map((insurance) => (
                    <tr key={insurance.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">
                            {insurance.shortName && <span className="text-sky-600">{insurance.shortName} - </span>}
                            {insurance.name}
                          </p>
                          {insurance.cnsfNumber && (
                            <p className="text-sm text-gray-500">CNSF: {insurance.cnsfNumber}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs ${INSURANCE_TYPE_COLORS[insurance.type as InsuranceType] || 'bg-gray-100 text-gray-800'}`}>
                          {INSURANCE_TYPE_LABELS[insurance.type as InsuranceType] || insurance.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {insurance.hasNationalCoverage && (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">Nacional</span>
                          )}
                          {insurance.coverageTypes?.slice(0, 2).map((type, idx) => (
                            <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">{type}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          <p className="text-gray-900">{insurance._count?.networkHospitals || 0} hospitales</p>
                          <p className="text-gray-500">{insurance._count?.plans || 0} planes</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {insurance.isVerified ? (
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Verificada</span>
                        ) : (
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full">Pendiente</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleVerifyInsurance(insurance.id, !insurance.isVerified)}
                          className={`text-sm ${insurance.isVerified ? 'text-yellow-600 hover:text-yellow-800' : 'text-green-600 hover:text-green-800'}`}
                        >
                          {insurance.isVerified ? 'Quitar verificacion' : 'Verificar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Pagination */}
            {insurancePagination && insurancePagination.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Mostrando {((insurancePage - 1) * 15) + 1} - {Math.min(insurancePage * 15, insurancePagination.total)} de {insurancePagination.total}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setInsurancePage(p => Math.max(1, p - 1))}
                    disabled={insurancePage === 1}
                    className="px-3 py-1 border rounded disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setInsurancePage(p => Math.min(insurancePagination.totalPages, p + 1))}
                    disabled={insurancePage === insurancePagination.totalPages}
                    className="px-3 py-1 border rounded disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Stat Card Component
const StatCard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    purple: 'bg-purple-50 text-purple-700',
    orange: 'bg-orange-50 text-orange-700',
  };

  return (
    <div className={`p-4 rounded-xl ${colorClasses[color] || 'bg-gray-50 text-gray-700'}`}>
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      <p className="text-sm opacity-75">{label}</p>
    </div>
  );
};

export default AdminInstitutions;
