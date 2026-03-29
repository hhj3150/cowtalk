// 방역 시스템 타입 — 역학조사, 가축이동, 방역조치, KAHIS 보고

// ======================================================================
// 역학조사 (Investigation)
// ======================================================================

export type InvestigationStatus =
  | 'draft'
  | 'pending_submit'
  | 'kahis_submitted'
  | 'closed';

export interface FeverAnimalDetail {
  readonly animalId: string;
  readonly earTag: string;
  readonly name: string | null;
  readonly currentTemp: number | null;
  readonly feverStartAt: string | null;
  readonly dsiScore: number;
  readonly tempHistory: readonly { ts: string; value: number }[];
}

export interface InvestigationRadiusSummary {
  readonly zone500m: { readonly farmCount: number; readonly headCount: number };
  readonly zone1km: { readonly farmCount: number; readonly headCount: number };
  readonly zone3km: { readonly farmCount: number; readonly headCount: number };
}

export interface InvestigationContactNetwork {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly directContacts: number;
}

export interface InvestigationWeather {
  readonly temperature: number | null;
  readonly windDeg: number | null;
  readonly windSpeed: number | null;
  readonly description: string;
}

export interface InvestigationFarmInfo {
  readonly name: string;
  readonly address: string;
  readonly ownerName: string | null;
  readonly phone: string | null;
  readonly lat: number;
  readonly lng: number;
  readonly currentHeadCount: number;
}

export interface InvestigationData {
  readonly investigationId: string;
  readonly farmId: string;
  readonly farm: InvestigationFarmInfo;
  readonly initiatedBy: string | null;
  readonly clusterId: string | null;
  readonly feverAnimals: readonly FeverAnimalDetail[];
  readonly radiusSummary: InvestigationRadiusSummary;
  readonly contactNetwork: InvestigationContactNetwork;
  readonly weather: InvestigationWeather;
  readonly nearbyAbnormalFarms: number;
  readonly status: InvestigationStatus;
  readonly fieldObservations: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ======================================================================
// 가축 이동이력 (Animal Transfer)
// ======================================================================

export type TransferReason =
  | 'sale'
  | 'lease'
  | 'treatment'
  | 'slaughter'
  | 'other';

export interface AnimalTransferData {
  readonly transferId: string;
  readonly animalId: string;
  readonly sourceFarmId: string;
  readonly destinationFarmId: string;
  readonly transferDate: string;
  readonly headCount: number;
  readonly reason: TransferReason;
  readonly traceNo: string | null;
  readonly createdAt: string;
}

// ======================================================================
// 방역조치 (Quarantine Action — DB 테이블용)
// ======================================================================

export type QuarantineActionDbType =
  | 'isolation'
  | 'movement_restriction'
  | 'disinfection'
  | 'vaccination'
  | 'culling'
  | 'monitoring';

export type QuarantineActionStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface QuarantineActionData {
  readonly actionId: string;
  readonly farmId: string;
  readonly investigationId: string | null;
  readonly clusterId: string | null;
  readonly actionType: QuarantineActionDbType;
  readonly status: QuarantineActionStatus;
  readonly description: string;
  readonly assignedTo: string | null;
  readonly dueDate: string | null;
  readonly completedAt: string | null;
  readonly notes: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ======================================================================
// KAHIS 보고 (KAHIS Report)
// ======================================================================

export type KahisReportType =
  | 'initial'
  | 'followup'
  | 'final'
  | 'negative';

export type KahisReportStatus =
  | 'draft'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'revision_required';

export interface KahisReportData {
  readonly reportId: string;
  readonly investigationId: string;
  readonly reportType: KahisReportType;
  readonly diseaseCode: string;
  readonly diseaseName: string;
  readonly status: KahisReportStatus;
  readonly submittedAt: string | null;
  readonly responseAt: string | null;
  readonly reportData: Record<string, unknown>;
  readonly submittedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ======================================================================
// API 요청/응답
// ======================================================================

export interface InvestigationListQuery {
  readonly farmId?: string;
  readonly status?: InvestigationStatus;
  readonly since?: string;
  readonly limit?: number;
}

export interface InvestigationPatch {
  readonly fieldObservations?: string;
  readonly status?: InvestigationStatus;
}
