// 행동 일별 지표 — 우군·그룹 단위 휴식(횡와)·기립·이동·반추 자세
//
// 센서 공급사·수집 경로와 무관한 일반 계약이다. 어떤 출처(API 어댑터, CSV 업로드, 수기)든
// 같은 형식으로 저장하고, 출처(source)를 항상 함께 남긴다.
// 원칙: 그룹 추세·변화를 보는 지표다. 개별 소의 질병 진단에 쓰지 않는다.

/** 그룹 구분 — 우군 전체(all) 또는 사양 그룹 */
export type BehaviorGroupKey = 'all' | 'lactating' | 'fresh' | 'close_up' | 'dry' | 'heifer' | 'other';

/** 수치 지표 키 (모두 선택값 — 출처마다 주는 지표가 다르다) */
export type BehaviorMetricKey =
  | 'lyingHours'
  | 'standingHours'
  | 'standingActiveHours'
  | 'standingInactiveHours'
  | 'movingHours'
  | 'ruminationLyingMin'
  | 'ruminationStandingMin'
  | 'ruminationLyingPct'
  | 'ruminationStandingPct'
  | 'peakLyingSyncPct'
  | 'animalCount';

export type BehaviorMetrics = { readonly [K in BehaviorMetricKey]?: number | null };

export interface BehaviorMetricDefinition {
  readonly key: BehaviorMetricKey;
  readonly labelKo: string;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  /** CSV 열 이름 자동 인식용 별칭 (소문자·공백 제거 후 비교) */
  readonly aliases: readonly string[];
}

/** 저장·조회 단위: 농장 × 그룹 × 날짜 × 출처 */
export interface BehaviorDailyRecord {
  readonly farmId: string;
  readonly groupKey: BehaviorGroupKey;
  /** YYYY-MM-DD (목장 현지 날짜) */
  readonly date: string;
  /** 수집 경로 — 'csv_upload' | 'manual' | 'sensor_api' 등 */
  readonly source: string;
  readonly metrics: BehaviorMetrics;
  readonly updatedAt?: string;
}

/** POST /behavior/daily 한 행 */
export interface BehaviorDailyInput {
  readonly groupKey: BehaviorGroupKey;
  readonly date: string;
  readonly metrics: BehaviorMetrics;
}

/** 7일 추세 요약 (화면 카드·팅커벨 공용) */
export interface BehaviorTrend {
  readonly groupKey: BehaviorGroupKey;
  readonly metric: BehaviorMetricKey;
  readonly latestDate: string | null;
  readonly latest: number | null;
  /** 최신일 직전 7일 평균 (최신일 제외) */
  readonly prior7Avg: number | null;
  readonly deltaVsPrior7: number | null;
  /** 직전 7일 중 값이 있는 날 수 — 신뢰도 표시용 */
  readonly priorDays: number;
}
