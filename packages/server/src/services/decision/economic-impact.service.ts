// 결정 카드 경제 환산 — "미조치 시 일 손실 약 X원"
//
// 원칙 (신뢰): 추정 유량으로 계산하지 않는다. 개체의 최근 7일 '실측' 유량이
// 있을 때만 환산하고, 결과에는 반드시 estimated 표기를 붙인다.
// 손실률 계수는 문헌 기반 보수적 추정치 — 개체별 실손실 학습으로 대체 예정.

/**
 * 원유 기본가격 (리터당, 원) — 낙농진흥회 고시 기본가격 기준 근사값.
 * 농가별 계약 단가 입력 기능 도입 전까지의 기본값 (환산 결과에 단가 노출).
 */
export const DEFAULT_MILK_PRICE_KRW_PER_L = 1084;

/**
 * 이벤트 유형별 일 유량 손실률 (보수적 문헌 추정치).
 * - 발열/열스트레스: 유량 10~35% 감소 보고 → 하한 근사 채택
 * - 반추 감소: 사료 섭취 저하 전조 → 5%
 * - 임상 질환(유방염 등): 10~25% → 15%
 */
export const LOSS_FRACTION_BY_EVENT: Readonly<Record<string, number>> = {
  temperature_high: 0.10,
  temperature_warning: 0.05,
  clinical_condition: 0.15,
  health_warning: 0.05,
  rumination_decrease: 0.05,
  drinking_decrease: 0.05,
};

export interface EconomicImpactEstimate {
  /** 미조치 시 일 손실 추정 (원) */
  readonly dailyLossKrw: number;
  /** 적용 손실률 (%) */
  readonly lossFractionPct: number;
  /** 근거 실측 평균 일 유량 (L) */
  readonly basisYieldL: number;
  /** 적용 단가 (원/L) */
  readonly priceKrwPerL: number;
  /** 항상 true — 모델 기반 추정임을 UI에 명시 */
  readonly estimated: true;
}

export function estimateDailyLoss(
  avgDailyYieldL: number,
  lossFraction: number,
  priceKrwPerL: number = DEFAULT_MILK_PRICE_KRW_PER_L,
): EconomicImpactEstimate | null {
  if (!Number.isFinite(avgDailyYieldL) || avgDailyYieldL <= 0) return null;
  if (!Number.isFinite(lossFraction) || lossFraction <= 0 || lossFraction > 1) return null;
  const dailyLossKrw = Math.round(avgDailyYieldL * lossFraction * priceKrwPerL);
  return {
    dailyLossKrw,
    lossFractionPct: Math.round(lossFraction * 100),
    basisYieldL: Math.round(avgDailyYieldL * 10) / 10,
    priceKrwPerL,
    estimated: true,
  };
}
