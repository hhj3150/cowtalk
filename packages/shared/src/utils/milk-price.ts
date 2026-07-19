// 유대단가 계산 — 기본가 + 유지방 가감 + 체세포 등급 가산 (순수 함수)
//
// 국내 원유가격 산정 구조의 단순화 모델:
//   유대단가(원/L) = 기본가 + (유지방% - 3.4) / 0.1 × 유지방가감 + 체세포 1등급 가산
// 가감 단가는 경제 파라미터(글로벌/농장 오버라이드)로 조정한다.
// 결과는 항상 '추정' — 실제 유대명세서 단가와 다를 수 있음을 UI에 명시한다.

/** 유지방 기준치 (%) — 국내 원유 기본가 기준 */
export const MILK_FAT_BASE_PCT = 3.4;
/** 체세포 1등급 상한 (천/mL) — 20만/mL */
export const SCC_GRADE1_MAX = 200;

export interface MilkPriceInput {
  /** 기본가 (원/L) */
  readonly basePriceKrwPerL: number;
  /** 유지방 0.1%p당 가감액 (원/L) */
  readonly fatAdjustKrwPer01Pct: number;
  /** 체세포 1등급 가산액 (원/L) */
  readonly sccGrade1BonusKrwPerL: number;
  /** 평균 유지방 (%) — 없으면 가감 없음 */
  readonly avgFatPct?: number | null;
  /** 평균 체세포 (천/mL) — 없으면 가산 없음 */
  readonly avgSccThousand?: number | null;
}

export interface MilkPriceEstimate {
  readonly pricePerL: number;
  readonly basePriceKrwPerL: number;
  readonly fatAdjustKrw: number;
  readonly sccBonusKrw: number;
  /** 사람이 읽는 산정 근거 (제안서·리포트에 그대로 노출) */
  readonly formula: string;
  readonly estimated: true;
}

export function computeMilkPricePerL(input: MilkPriceInput): MilkPriceEstimate {
  const fat = input.avgFatPct != null && Number.isFinite(input.avgFatPct) ? input.avgFatPct : null;
  const scc = input.avgSccThousand != null && Number.isFinite(input.avgSccThousand) ? input.avgSccThousand : null;

  const fatAdjustKrw = fat !== null
    ? Math.round(((fat - MILK_FAT_BASE_PCT) / 0.1) * input.fatAdjustKrwPer01Pct * 10) / 10
    : 0;
  const sccBonusKrw = scc !== null && scc <= SCC_GRADE1_MAX ? input.sccGrade1BonusKrwPerL : 0;

  const pricePerL = Math.max(0, Math.round((input.basePriceKrwPerL + fatAdjustKrw + sccBonusKrw) * 10) / 10);

  const parts = [`기본가 ${input.basePriceKrwPerL.toLocaleString()}원`];
  if (fat !== null) parts.push(`유지방 ${fat}% 가감 ${fatAdjustKrw >= 0 ? '+' : ''}${fatAdjustKrw}원`);
  if (scc !== null) parts.push(scc <= SCC_GRADE1_MAX ? `체세포 1등급 +${input.sccGrade1BonusKrwPerL}원` : `체세포 ${scc}천/mL (1등급 아님 +0원)`);

  return {
    pricePerL,
    basePriceKrwPerL: input.basePriceKrwPerL,
    fatAdjustKrw,
    sccBonusKrw,
    formula: parts.join(' '),
    estimated: true,
  };
}

// ===========================
// 3단 유대 수입 — 쿼터(납유) / 초과(가공유) / 자체가공 (순수)
// ===========================

export interface TieredRevenueInput {
  /** 일별 물량: 총 유량과 그중 자체가공 물량 (L) */
  readonly days: readonly { readonly totalL: number; readonly selfL?: number | null }[];
  /** 1일 쿼터량 (L). 0 이하 = 쿼터 미설정 → 납유분 전량 쿼터 단가 */
  readonly dailyQuotaL: number;
  /** 납유(쿼터 내) 단가 원/L */
  readonly quotaPriceKrwPerL: number;
  /** 가공유(쿼터 초과) 단가 원/L */
  readonly surplusPriceKrwPerL: number;
  /** 자체가공 환산 단가 원/L */
  readonly selfPriceKrwPerL: number;
}

export interface TieredRevenueResult {
  readonly quotaL: number;
  readonly surplusL: number;
  readonly selfL: number;
  readonly revenueKrw: number;
  /** 가중평균 단가 (원/L) — 총 물량 0이면 0 */
  readonly avgPricePerL: number;
  /** 사람이 읽는 내역 — 리포트에 그대로 노출 */
  readonly formula: string;
  readonly estimated: true;
}

/**
 * 일별로 자체가공 물량을 먼저 떼고, 남은 납유분을 쿼터량까지 납유 단가,
 * 초과분을 가공유 단가로 배분한다. 쿼터 미설정(0)이면 납유분 전량 쿼터 단가.
 */
export function computeTieredRevenue(input: TieredRevenueInput): TieredRevenueResult {
  let quotaL = 0;
  let surplusL = 0;
  let selfL = 0;

  for (const day of input.days) {
    const total = Number.isFinite(day.totalL) && day.totalL > 0 ? day.totalL : 0;
    if (total <= 0) continue;
    const self = Math.min(Math.max(day.selfL ?? 0, 0), total);
    const shipped = total - self; // 납유 대상
    const quota = input.dailyQuotaL > 0 ? Math.min(shipped, input.dailyQuotaL) : shipped;
    quotaL += quota;
    surplusL += shipped - quota;
    selfL += self;
  }

  const revenueKrw = Math.round(
    quotaL * input.quotaPriceKrwPerL +
    surplusL * input.surplusPriceKrwPerL +
    selfL * input.selfPriceKrwPerL,
  );
  const totalL = quotaL + surplusL + selfL;

  const parts: string[] = [];
  if (quotaL > 0) parts.push(`쿼터 ${Math.round(quotaL).toLocaleString()}L×${input.quotaPriceKrwPerL.toLocaleString()}원`);
  if (surplusL > 0) parts.push(`초과 ${Math.round(surplusL).toLocaleString()}L×${input.surplusPriceKrwPerL.toLocaleString()}원`);
  if (selfL > 0) parts.push(`자체가공 ${Math.round(selfL).toLocaleString()}L×${input.selfPriceKrwPerL.toLocaleString()}원`);

  return {
    quotaL: Math.round(quotaL),
    surplusL: Math.round(surplusL),
    selfL: Math.round(selfL),
    revenueKrw,
    avgPricePerL: totalL > 0 ? Math.round((revenueKrw / totalL) * 10) / 10 : 0,
    formula: parts.length > 0 ? parts.join(' + ') : '물량 없음',
    estimated: true,
  };
}

// ===========================
// TMR 배합비 — 두당 일 사료비 (순수)
// ===========================

export interface FeedIngredient {
  readonly name: string;
  /** 급여량 (kg/일/두) */
  readonly amountKgPerDay: number;
  /** 원료 단가 (원/kg) */
  readonly costPerKg: number;
}

/** 두당 일 사료비 = Σ(급여량 × 단가). 음수·비정상 값은 0으로 취급 */
export function computeDailyFeedCost(ingredients: readonly FeedIngredient[]): number {
  return Math.round(
    ingredients.reduce((sum, ing) => {
      const amount = Number.isFinite(ing.amountKgPerDay) && ing.amountKgPerDay > 0 ? ing.amountKgPerDay : 0;
      const cost = Number.isFinite(ing.costPerKg) && ing.costPerKg > 0 ? ing.costPerKg : 0;
      return sum + amount * cost;
    }, 0),
  );
}
