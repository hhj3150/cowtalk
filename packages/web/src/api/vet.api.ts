// 수의사 진료센터 API 클라이언트 (1단계)
import { apiGet, apiPost } from './client';

export interface VetFarm {
  farm_id: string;
  farm_name: string;
  owner_name: string | null;
  address: string | null;
  region_id: string | null;
  current_head_count: number | null;
}

export interface VetAnimal {
  animal_id: string;
  ear_tag_number: string;
  trace_id: string | null;
  name: string | null;
  breed: string;
  sex: string;
  parity: number;
  days_in_milk: number | null;
  lactation_status: string;
  status: string;
}

export interface ClinicalContext {
  farm_snapshot: Record<string, unknown>;
  animal_snapshot: Record<string, unknown>;
  reproduction_snapshot: Record<string, unknown>;
  health_history_snapshot: Record<string, unknown>;
  sensor_snapshot: Record<string, unknown>;
  public_data_snapshot: Record<string, unknown>;
  recent_visits: Array<Record<string, unknown>>;
  active_alerts: Array<Record<string, unknown>>;
  current_withdrawal_status: Record<string, unknown>;
  document_history: Array<Record<string, unknown>>;
  external_sync_status: Record<string, unknown>;
}

export interface VetVisit {
  visit_id: string;
  visit_datetime: string;
  visit_reason: string | null;
  chief_complaint: string | null;
  final_diagnosis: string | null;
  treatment: string | null;
  prescription: string | null;
  withdrawal_period: string | null;
  status: string;
  input_method: string;
}

export interface SaveVisitPayload {
  visitReason?: string;
  chiefComplaint?: string;
  farmerStatement?: string;
  physicalExam?: string;
  clinicalFindings?: string;
  differentialDiagnosis?: string;
  finalDiagnosis?: string;
  treatment?: string;
  prescription?: string;
  medication?: string;
  withdrawalPeriod?: string;
  prognosis?: string;
  followUpDate?: string;
  farmerInstruction?: string;
  quarantineRequired?: boolean;
  veterinarianNotes?: string;
  status?: 'draft' | 'saved' | 'finalized';
  inputMethod?: 'manual' | 'quick_select' | 'voice' | 'conversation' | 'mixed';
  rawConversationNote?: string;
  fieldVisitLocation?: string;
}

export const vetApi = {
  listFarms: () => apiGet<VetFarm[]>('/vet/farms'),
  listAnimals: (farmId: string) => apiGet<VetAnimal[]>(`/vet/farms/${farmId}/animals`),
  clinicalContext: (farmId: string, animalId: string) =>
    apiGet<ClinicalContext>(`/vet/farms/${farmId}/animals/${animalId}/clinical-context`),
  listVisits: (farmId: string, animalId: string) =>
    apiGet<VetVisit[]>(`/vet/farms/${farmId}/animals/${animalId}/visits`),
  saveVisit: (farmId: string, animalId: string, payload: SaveVisitPayload) =>
    apiPost<{ visitId: string }>(`/vet/farms/${farmId}/animals/${animalId}/visits`, payload),
};
