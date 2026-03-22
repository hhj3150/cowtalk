// 체온 + 반추 정밀 모니터링 타입 — 전염성 질병 조기경보 핵심 데이터

export interface VitalTimelinePoint {
  readonly date: string;
  readonly temp: VitalAggregation;
  readonly rumination: VitalAggregation;
  readonly eventCount: number;
}

export interface VitalAggregation {
  readonly avg: number;
  readonly min: number;
  readonly max: number;
  readonly stddev: number;
  readonly anomalyCount: number;
  readonly sampleCount: number;
}

export interface VitalAnomaly {
  readonly animalId: string;
  readonly earTag: string;
  readonly date: string;
  readonly metric: 'temp' | 'rumination';
  readonly value: number;
  readonly herdAvg: number;
  readonly deviation: number;
  readonly severity: 'warning' | 'critical';
}

export interface VitalEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly label: string;
  readonly detectedAt: string;
  readonly severity: string;
  readonly earTag: string;
  readonly animalId: string;
}

export interface VitalMonitorData {
  readonly farmId: string | null;
  readonly farmName: string | null;
  readonly period: { readonly from: string; readonly to: string; readonly days: number };
  readonly timeline: readonly VitalTimelinePoint[];
  readonly anomalies: readonly VitalAnomaly[];
  readonly events: readonly VitalEvent[];
  readonly summary: VitalSummary;
}

export interface VitalSummary {
  readonly avgTemp: number;
  readonly avgRumination: number;
  readonly tempTrend: 'rising' | 'falling' | 'stable';
  readonly ruminationTrend: 'rising' | 'falling' | 'stable';
  readonly totalAnomalies: number;
  readonly criticalAnomalies: number;
  readonly riskLevel: 'normal' | 'caution' | 'warning' | 'critical';
}
