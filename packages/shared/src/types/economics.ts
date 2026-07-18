// 경제 파라미터 — "경제 계산식은 하드코딩하지 않는다" 원칙의 데이터 계약
//
// 글로벌 기본값(코드 카탈로그) → 글로벌 오버라이드(DB, farm_id NULL)
// → 농장별 오버라이드(DB, farm_id) 순으로 병합된 '유효값'을 모든 경제 환산이 사용한다.

/** 경제 환산에 쓰이는 파라미터 키 (신규 키는 shared 카탈로그에 정의 추가) */
export type EconomicParameterKey =
  | 'milk_price_krw_per_l'
  | 'open_day_cost_krw'
  | 'insemination_cost_krw'
  | 'mastitis_case_loss_krw'
  | 'ketosis_case_loss_krw'
  | 'adult_death_loss_krw'
  | 'calf_value_krw'
  | 'treatment_cost_per_case_krw'
  | 'labor_hour_cost_krw'
  | 'sensor_cost_per_head_krw';

/** 파라미터 값의 출처 — UI에서 어디서 온 값인지 항상 표시한다 */
export type EconomicParameterSource = 'default' | 'global' | 'farm';

/** 카탈로그 정의 (코드에 고정 — 기본값·단위·허용 범위·설명) */
export interface EconomicParameterDefinition {
  readonly key: EconomicParameterKey;
  readonly labelKo: string;
  readonly unit: string;
  readonly defaultValue: number;
  /** 허용 최소값 (검증) */
  readonly min: number;
  /** 허용 최대값 (검증) */
  readonly max: number;
  /** 기본값의 근거 — 정직성 원칙: 어디서 온 수치인지 항상 밝힌다 */
  readonly basis: string;
}

/** 유효값 뷰 — 목록 API 응답의 한 행 */
export interface EconomicParameterView {
  readonly key: EconomicParameterKey;
  readonly labelKo: string;
  readonly unit: string;
  readonly value: number;
  readonly defaultValue: number;
  readonly source: EconomicParameterSource;
  readonly basis: string;
  readonly updatedAt: string | null;
}

/** GET /economics/roi-calculator 응답 — 파라미터 기반 실계산 결과 */
export interface RoiEstimate {
  readonly investmentType: string;
  readonly headCount: number;
  /** 초기 도입비 (센서 도입비 × 두수) */
  readonly initialCostKrw: number;
  /** 연간 편익 합계 */
  readonly annualBenefitKrw: number;
  /** 편익 내역 — 각 항목이 어떤 파라미터×가정으로 계산됐는지 */
  readonly benefitBreakdown: readonly {
    readonly label: string;
    readonly annualKrw: number;
    readonly formula: string;
  }[];
  /** 투자 회수기간 (개월) — 편익이 0이면 null */
  readonly paybackMonths: number | null;
  /** 5년 순편익 / 초기 투자 (%) — 초기 투자가 0이면 null */
  readonly fiveYearRoiPct: number | null;
  /** 계산에 실제 적용된 단가 (파라미터 유효값) */
  readonly appliedParameters: Readonly<Partial<Record<EconomicParameterKey, number>>>;
  /** 효과 계수 가정 — 실측이 아님을 명시 */
  readonly assumptions: readonly string[];
  /** 항상 true — 문헌 가정 기반 추정임을 UI에 명시 */
  readonly estimated: true;
}

/** PUT /economics/parameters 요청 본문 */
export interface UpsertEconomicParameterInput {
  readonly key: EconomicParameterKey;
  readonly value: number;
  /** 없으면 글로벌 오버라이드 (government_admin 전용) */
  readonly farmId?: string;
}
