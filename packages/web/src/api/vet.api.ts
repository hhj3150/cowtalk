// 수의사 진료센터 API 클라이언트 (1~4단계)
import { apiGet, apiPost, apiPatch, apiPut, apiClient } from './client';

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
  aiStructuredNote?: Record<string, unknown>;
  veterinarianConfirmedAiNote?: boolean;
}

export interface StructuredNote {
  animal_identifier: string;
  visit_reason: string;
  chief_complaint: string;
  farmer_statement: string;
  physical_exam: string;
  clinical_findings: string;
  differential_diagnosis: string;
  final_diagnosis: string;
  treatment: string;
  medication: string;
  prescription: string;
  withdrawal_period: string;
  prognosis: string;
  follow_up_date: string;
  farmer_instruction: string;
  quarantine_required: boolean;
  document_suggestions: string[];
  missing_required_fields: string[];
  safety_warnings: string[];
}

export interface ConversationNoteResult {
  structured_note: StructuredNote;
  source_separation: {
    veterinarian_spoken_content: Record<string, unknown>;
    cowtalk_auto_data: Record<string, unknown>;
    ai_suggestions: Record<string, unknown>;
  };
  ai_disclaimer: string;
}

// 3단계 — 진료기록 수정/이력
export type EditableVisitPayload = Pick<SaveVisitPayload,
  | 'visitReason' | 'chiefComplaint' | 'farmerStatement' | 'physicalExam' | 'clinicalFindings'
  | 'differentialDiagnosis' | 'finalDiagnosis' | 'treatment' | 'prescription' | 'medication'
  | 'withdrawalPeriod' | 'prognosis' | 'followUpDate' | 'farmerInstruction' | 'quarantineRequired'
  | 'veterinarianNotes' | 'status'>;

export interface UpdateVisitPayload extends EditableVisitPayload {
  editReason?: string;
}

export interface UpdateVisitResult {
  visitId: string;
  revisionNumber: number;
  changedFields: string[];
}

export interface VisitRevision {
  revision_id: string;
  revision_number: number;
  edited_by: string;
  edit_reason: string | null;
  changed_fields: string[];
  previous_values: Record<string, unknown>;
  edited_at: string;
}

export interface VisitDetail {
  visit: Record<string, unknown>;
  snapshot: Record<string, unknown> | null;
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
  structureConversationNote: (farmId: string, animalId: string, rawNote: string) =>
    apiPost<ConversationNoteResult>('/vet/ai/conversation-note', { farmId, animalId, rawNote }),
  // 3단계
  getVisit: (visitId: string) => apiGet<VisitDetail>(`/vet/visits/${visitId}`),
  updateVisit: (visitId: string, payload: UpdateVisitPayload) =>
    apiPatch<UpdateVisitResult>(`/vet/visits/${visitId}`, payload),
  listRevisions: (visitId: string) => apiGet<VisitRevision[]>(`/vet/visits/${visitId}/revisions`),
  // 4단계 — 공식 문서
  getDocument: (visitId: string, docType: VetDocType) =>
    apiGet<VetDocModel>(`/vet/visits/${visitId}/documents/${docType}`),
  downloadDocumentPdf: async (visitId: string, docType: VetDocType): Promise<Blob> => {
    const res = await apiClient.get<Blob>(
      `/vet/visits/${visitId}/documents/${docType}/pdf`,
      { responseType: 'blob' },
    );
    return res.data;
  },
  // 면허/병원 마스터
  getProfile: () => apiGet<VetProfile | null>('/vet/profile'),
  saveProfile: (payload: VetProfilePayload) => apiPut<VetProfile>('/vet/profile', payload),
  // 5단계 — 보내기
  sendDocument: (visitId: string, docType: VetDocType, note?: string) =>
    apiPost<SendDocumentResult>(`/vet/visits/${visitId}/documents/${docType}/send`, { note }),
  listDeliveries: (visitId: string) => apiGet<VetDelivery[]>(`/vet/visits/${visitId}/deliveries`),
};

// 면허/병원 마스터
export interface VetProfile {
  licenseNumber: string | null;
  clinicName: string | null;
  clinicAddress: string | null;
  clinicPhone: string | null;
  updatedAt?: string | null;
}
export type VetProfilePayload = Omit<VetProfile, 'updatedAt'>;

// 5단계 — 전달
export interface SendDocumentResult {
  deliveryId: string;
  pushDelivered: number;
}
export interface VetDelivery {
  delivery_id: string;
  doc_type: VetDocType;
  doc_title: string;
  recipient_name: string | null;
  channel: string;
  note: string | null;
  status: string;
  push_delivered: number;
  sent_at: string;
}

// 4단계 — 공식 문서 모델 (서버 document-builder와 동일 형태)
export const VET_DOC_TYPES = ['medical_record', 'prescription', 'diagnosis'] as const;
export type VetDocType = (typeof VET_DOC_TYPES)[number];
export const VET_DOC_LABELS: Record<VetDocType, string> = {
  medical_record: '진료기록부',
  prescription: '처방전',
  diagnosis: '진단서',
};

export interface VetDocPair { key: string; value: string }
export interface VetDocSection {
  heading: string;
  pairs?: VetDocPair[];
  paragraphs?: string[];
}
export interface VetDocModel {
  doc_type: VetDocType;
  doc_title: string;
  issue_date: string;
  header_pairs: VetDocPair[];
  sections: VetDocSection[];
  issuer: { name: string; email: string | null; licenseNumber: string | null; clinicName: string | null };
  footer_notes: string[];
}
