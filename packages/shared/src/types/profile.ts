// 통합 프로파일 타입 — Data Spine의 최종 출력, Claude AI 입력

import type { Severity } from './common.js';

// ===========================
// 축종 구분
// ===========================

export type BreedType = 'dairy' | 'beef';

// ===========================
// smaXtec 이벤트 (신뢰 — 재판단 안 함)
// ===========================

export type SmaxtecEventType =
  // 발정
  | 'estrus'
  | 'estrus_dnb'
  // 번식
  | 'insemination'
  | 'pregnancy_check'
  | 'fertility_warning'
  | 'no_insemination'
  // 분만
  | 'calving'
  | 'calving_detection'
  | 'calving_confirmation'
  | 'calving_waiting'
  | 'abortion'
  // 체온
  | 'temperature_high'
  | 'temperature_low'
  | 'temperature_warning'
  // 반추
  | 'rumination_decrease'
  | 'rumination_warning'
  // 활동
  | 'activity_increase'
  | 'activity_decrease'
  | 'activity_warning'
  // 건강 종합
  | 'health_general'
  | 'health_warning'
  | 'clinical_condition'
  // 사양
  | 'feeding_warning'
  | 'drinking_warning'
  // 관리
  | 'dry_off'
  | 'management';

export interface SmaxtecEvent {
  readonly eventId: string;
  readonly type: SmaxtecEventType;
  readonly animalId: string;
  readonly detectedAt: Date;
  readonly confidence: number;
  readonly severity: Severity;
  readonly stage?: string;
  readonly details: Record<string, unknown>;
  readonly rawData: Record<string, unknown>;
}

// ===========================
// 센서 최신값
// ===========================

export interface LatestSensorReading {
  readonly temperature: number | null;
  readonly rumination: number | null;
  readonly activity: number | null;
  readonly waterIntake: number | null;
  readonly ph: number | null;
  readonly measuredAt: Date | null;
}

// ===========================
// AnimalProfile — 개체 통합 프로파일
// ===========================

export interface AnimalProfile {
  // 기본 정보
  readonly animalId: string;
  readonly earTag: string;
  readonly traceId: string | null; // 이력번호
  readonly breedType: BreedType;
  readonly breed: string;
  readonly birthDate: Date | null;
  readonly sex: string;
  readonly parity: number;
  readonly sire: PedigreeInfo | null;
  readonly dam: PedigreeInfo | null;

  // 소속
  readonly farmId: string;
  readonly farmName: string;
  readonly region: string;
  readonly tenantId: string | null;

  // smaXtec 최신 센서 (신뢰)
  readonly latestSensor: LatestSensorReading;

  // smaXtec 센서 히스토리
  readonly sensorHistory24h: readonly SensorSnapshot[];
  readonly sensorHistory7d: readonly SensorSnapshot[];
  readonly sensorHistory30d: readonly SensorSnapshot[];

  // smaXtec 활성 이벤트 (신뢰 — 재판단 안 함)
  readonly activeEvents: readonly SmaxtecEvent[];

  // 번식 이력
  readonly breedingHistory: readonly BreedingRecord[];
  readonly pregnancyStatus: PregnancyStatus | null;
  readonly daysSinceInsemination: number | null;
  readonly breedingFeedback: BreedingFeedbackSummary | null;

  // 건강 이력
  readonly healthHistory: readonly HealthRecord[];

  // 생산 데이터 (젖소만)
  readonly production: DairyProduction | null;

  // 비육 데이터 (한우만)
  readonly growth: BeefGrowth | null;

  // 환경
  readonly environment: EnvironmentData | null;

  // 지역 맥락
  readonly regionalContext: RegionalContext | null;
}

// ===========================
// FarmProfile — 농장 단위 통합
// ===========================

export interface FarmProfile {
  readonly farmId: string;
  readonly name: string;
  readonly address: string;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly region: string;
  readonly tenantId: string | null;
  readonly totalAnimals: number;
  readonly breedComposition: Readonly<Record<BreedType, number>>;
  readonly activeSmaxtecEvents: readonly SmaxtecEvent[];
  readonly animalProfiles: readonly AnimalProfile[];
  readonly farmHealthScore: number | null;
  readonly todayActions: readonly string[];
  // 최근 30일 이벤트 타임라인 (시간순, 질병 패턴 분석용)
  readonly eventTimeline?: readonly FarmEventTimelineEntry[];
  // animalId → earTag 룩업 (프롬프트에서 UUID 대신 #번호 표시용)
  readonly animalIdToEarTag?: Readonly<Record<string, string>>;
  // 군 센서 개요 — 이상신호와 별개로 "전체 데이터의 평균"을 목장/품종/지역/전국 4단으로 비교
  readonly herdSensorOverview?: HerdSensorOverview | null;
}

// ===========================
// HerdSensorOverview — 군 단위 센서 개요 (목장 ↔ 품종 ↔ 지역 ↔ 전국)
// 이벤트(이상신호)가 아니라 실측 일별 집계의 "평균"이 대상이다.
// ===========================

/** drinking = 음수 횟수/일 (체온 딥 기반 파생). 음수량(L)은 볼루스로 측정 불가 */
export type HerdOverviewMetric = 'temperature' | 'activity' | 'rumination' | 'drinking';

export type HerdOverviewScope = 'farm' | 'breed' | 'region' | 'national';

/** 품종군 — 기준치 참고용 분류 (실측 품종 평균이 우선, 참고 범위는 보조) */
export type BreedGroup = 'dairy' | 'beef' | 'buffalo' | 'other';

export interface HerdMetricStat {
  /** 개체별 기간 평균의 평균 (개체 가중 — 측정 횟수가 많은 개체가 지배하지 않게) */
  readonly avg: number;
  readonly min: number;
  readonly max: number;
  /** 개체 간 표준편차 */
  readonly stddev: number;
  /** 기여한 개체 수 */
  readonly animals: number;
  /** 기여한 농장 수 (farm 스코프는 1) */
  readonly farms: number;
  /** 기여한 일별 집계 행 수 */
  readonly rows: number;
}

export interface HerdMetricComparison {
  readonly metric: HerdOverviewMetric;
  readonly unit: string;
  readonly farm: HerdMetricStat | null;
  readonly breed: HerdMetricStat | null;
  readonly region: HerdMetricStat | null;
  readonly national: HerdMetricStat | null;
  /** 목장 평균 − 기준 평균 (기준이 없으면 null) */
  readonly deltaVsBreed: number | null;
  readonly deltaVsRegion: number | null;
  readonly deltaVsNational: number | null;
  /** 목장 최근 절반 기간 평균 − 앞 절반 기간 평균 (추세). 데이터 부족 시 null */
  readonly farmTrend: number | null;
}

/** 우군 구성 — 기초 보고서의 첫 줄. 센서 착용 두수가 평균의 모수를 말해준다 */
export interface HerdComposition {
  readonly total: number;
  /** 센서 시리얼(externalId)이 있는 두수 */
  readonly withSensor: number;
  readonly milking: number;
  readonly dry: number;
  readonly heifer: number;
  readonly avgParity: number | null;
  /** 착유우 평균 착유일수 */
  readonly avgDaysInMilk: number | null;
}

export interface HerdOverviewCoverage {
  readonly farmTotalAnimals: number;
  /** 기간 내 일별 집계가 1건이라도 있는 목장 개체 수 */
  readonly farmAnimalsWithData: number;
  /** 우군 구성 (farmId 있을 때만) */
  readonly herd: HerdComposition | null;
  readonly breedLabel: string | null;
  readonly breedGroup: BreedGroup | null;
  readonly province: string | null;
  readonly regionFarms: number;
  readonly nationalFarms: number;
}

export interface HerdSensorOverview {
  readonly farmId: string | null;
  readonly farmName: string | null;
  readonly days: number;
  readonly from: string; // YYYY-MM-DD
  readonly to: string;   // YYYY-MM-DD
  readonly coverage: HerdOverviewCoverage;
  readonly metrics: readonly HerdMetricComparison[];
  /** 데이터 신뢰도·범위에 대한 정직한 주석 (예: "pH는 별도 볼루스 — 수집 대상 아님") */
  readonly notes: readonly string[];
  readonly computedAt: string;
}

export interface FarmEventTimelineEntry {
  readonly date: string;         // ISO date
  readonly eventType: string;
  readonly earTag: string;
  readonly severity: string;
  readonly details: string;
}

// ===========================
// RegionalProfile — 지역/테넌트 단위
// ===========================

export interface RegionalProfile {
  readonly regionId: string | null;
  readonly tenantId: string | null;
  readonly farms: readonly FarmSummaryInProfile[];
  readonly totalAnimals: number;
  readonly activeAlerts: number;
  readonly clusterSignals: readonly ClusterSignal[];
  readonly summary: string;
}

// ===========================
// 보조 타입
// ===========================

export interface PedigreeInfo {
  readonly name: string | null;
  readonly registrationNumber: string | null;
  readonly breed: string | null;
}

export interface SensorSnapshot {
  readonly timestamp: Date;
  readonly temperature: number | null;
  readonly rumination: number | null;
  readonly activity: number | null;
  readonly waterIntake: number | null;
  readonly ph: number | null;
}

export type PregnancyStatus = 'open' | 'inseminated' | 'confirmed' | 'late_gestation';

export interface BreedingFeedbackSummary {
  readonly conceptionRate: number | null; // 수태율 (%). null = 데이터 부족 (D5).
  readonly conceptionRateDisplay?: string; // "—" 또는 "83.0%"
  readonly conceptionRateStatus?: 'ok' | 'data_insufficient';
  readonly totalInseminations: number;
  readonly pregnantCount: number;
  readonly openCount: number;
  readonly pendingCount: number;
  readonly recentOutcomes: readonly BreedingOutcome[];
}

export interface BreedingOutcome {
  readonly date: string;
  readonly bullName: string | null;
  readonly result: string; // 'pregnant' | 'open' | 'pending'
}

export interface BreedingRecord {
  readonly date: Date;
  readonly semenType: string | null;
  readonly technician: string | null;
  readonly result: 'success' | 'fail' | 'pending' | 'unknown';
}

export interface HealthRecord {
  readonly date: Date;
  readonly diagnosis: string;
  readonly treatment: string | null;
  readonly vet: string | null;
}

export interface DairyProduction {
  readonly milkYield: number | null;
  readonly fat: number | null;
  readonly protein: number | null;
  readonly scc: number | null; // 체세포수
  readonly testDate: Date | null;
}

export interface BeefGrowth {
  readonly weight: number | null;
  readonly dailyGain: number | null;
  readonly gradeEstimate: string | null;
  readonly measureDate: Date | null;
}

export interface EnvironmentData {
  readonly tempOutside: number | null;
  readonly humidity: number | null;
  readonly thi: number | null; // Temperature-Humidity Index
}

export interface RegionalContext {
  readonly nearbyDiseaseReports: readonly DiseaseReport[];
  readonly regionalAlerts: readonly string[];
}

export interface DiseaseReport {
  readonly diseaseType: string;
  readonly reportDate: Date;
  readonly location: string;
  readonly distance: number | null; // km
}

export interface FarmSummaryInProfile {
  readonly farmId: string;
  readonly name: string;
  readonly totalAnimals: number;
  readonly activeAlerts: number;
  readonly healthScore: number | null;
}

export interface ClusterSignal {
  readonly signalType: string;
  readonly affectedFarms: readonly string[];
  readonly severity: Severity;
  readonly description: string;
}

// ===========================
// 커넥터 관련 타입
// ===========================

export type ConnectorStatus = 'connected' | 'disconnected' | 'error' | 'syncing';

export interface ConnectorHealth {
  readonly connectorId: string;
  readonly name: string;
  readonly status: ConnectorStatus;
  readonly lastSyncAt: Date | null;
  readonly lastError: string | null;
  readonly recordsProcessed: number;
}

export interface IngestionRun {
  readonly runId: string;
  readonly sourceId: string;
  readonly sourceType: string;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly recordsCount: number;
  readonly status: 'running' | 'success' | 'failed' | 'partial';
  readonly errorMessage: string | null;
}
