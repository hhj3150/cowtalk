// 센서 도입 ROI 계산 — 하드코딩 수치를 파라미터 기반 실계산으로 대체
//
// 원칙 (정직성):
// - 단가·비용은 경제 파라미터(글로벌/농장 오버라이드 가능)를 사용한다
// - 효과 계수(발생률·개선률)는 문헌 기반 '가정'이며, 응답에 수치와 근거를 항상 노출한다
// - 결과는 estimated: true — 이 농장의 실측 효과가 아님을 UI에 명시한다

import type { EconomicParameterKey, RoiEstimate } from '@cowtalk/shared';

/**
 * 효과 계수 — 문헌 기반 보수적 가정 (이 농장의 실측치가 아니다).
 * 파일럿 데이터가 쌓이면 농장별 실측 효과로 대체하는 것이 목표.
 */
export const ROI_EFFECT_ASSUMPTIONS = {
  /** 유방염 연간 발생률 (건/두/년) — 국내 낙농 문헌 20~40% 중 보수값 */
  mastitisIncidencePerHeadYear: 0.25,
  /** 조기발견 시 유방염 1건 손실 절감률 — 조기 치료 문헌 보고 30~50% 중 하한 */
  mastitisLossReduction: 0.3,
  /** 케토시스 연간 발생률 (건/두/년) — 준임상 포함 문헌 10~30% 중 보수값 */
  ketosisIncidencePerHeadYear: 0.15,
  /** 조기발견 시 케토시스 1건 손실 절감률 */
  ketosisLossReduction: 0.3,
  /** 발정탐지 개선으로 단축되는 공태일 (일/두/년) — 활동량 센서 문헌 5~15일 중 보수값 */
  openDaysSavedPerHeadYear: 5,
  /** 조기경보로 감소하는 성우 폐사율 (%p/년) — 문헌 보고 0.3~1.0%p 중 하한 */
  adultDeathReductionPerYear: 0.003,
} as const;

export type { RoiEstimate };

export function computeSensorRoi(
  headCount: number,
  params: Record<EconomicParameterKey, number>,
  investmentType = 'sensor',
): RoiEstimate | null {
  if (!Number.isFinite(headCount) || headCount <= 0 || headCount > 100000) return null;

  const a = ROI_EFFECT_ASSUMPTIONS;
  const initialCostKrw = Math.round(headCount * params.sensor_cost_per_head_krw);

  const mastitisSaving =
    headCount * a.mastitisIncidencePerHeadYear * a.mastitisLossReduction * params.mastitis_case_loss_krw;
  const ketosisSaving =
    headCount * a.ketosisIncidencePerHeadYear * a.ketosisLossReduction * params.ketosis_case_loss_krw;
  const openDaySaving = headCount * a.openDaysSavedPerHeadYear * params.open_day_cost_krw;
  const deathSaving = headCount * a.adultDeathReductionPerYear * params.adult_death_loss_krw;

  const benefitBreakdown = [
    {
      label: '유방염 조기발견 손실 절감',
      annualKrw: Math.round(mastitisSaving),
      formula: `${headCount}두 × ${a.mastitisIncidencePerHeadYear}건/두/년 × ${Math.round(a.mastitisLossReduction * 100)}% 절감 × ${params.mastitis_case_loss_krw.toLocaleString()}원/건`,
    },
    {
      label: '케토시스 조기발견 손실 절감',
      annualKrw: Math.round(ketosisSaving),
      formula: `${headCount}두 × ${a.ketosisIncidencePerHeadYear}건/두/년 × ${Math.round(a.ketosisLossReduction * 100)}% 절감 × ${params.ketosis_case_loss_krw.toLocaleString()}원/건`,
    },
    {
      label: '발정탐지 개선 공태일 단축',
      annualKrw: Math.round(openDaySaving),
      formula: `${headCount}두 × ${a.openDaysSavedPerHeadYear}일/두/년 × ${params.open_day_cost_krw.toLocaleString()}원/일`,
    },
    {
      label: '조기경보 폐사 감소',
      annualKrw: Math.round(deathSaving),
      formula: `${headCount}두 × ${(a.adultDeathReductionPerYear * 100).toFixed(1)}%p/년 × ${params.adult_death_loss_krw.toLocaleString()}원/두`,
    },
  ] as const;

  const annualBenefitKrw = benefitBreakdown.reduce((sum, b) => sum + b.annualKrw, 0);
  const paybackMonths =
    annualBenefitKrw > 0 ? Math.round((initialCostKrw / annualBenefitKrw) * 12 * 10) / 10 : null;
  const fiveYearRoiPct =
    initialCostKrw > 0
      ? Math.round(((annualBenefitKrw * 5 - initialCostKrw) / initialCostKrw) * 100)
      : null;

  return {
    investmentType,
    headCount,
    initialCostKrw,
    annualBenefitKrw,
    benefitBreakdown,
    paybackMonths,
    fiveYearRoiPct,
    appliedParameters: {
      sensor_cost_per_head_krw: params.sensor_cost_per_head_krw,
      mastitis_case_loss_krw: params.mastitis_case_loss_krw,
      ketosis_case_loss_krw: params.ketosis_case_loss_krw,
      open_day_cost_krw: params.open_day_cost_krw,
      adult_death_loss_krw: params.adult_death_loss_krw,
    },
    assumptions: [
      '효과 계수(발생률·개선률)는 문헌 기반 보수적 가정이며 이 농장의 실측치가 아닙니다',
      '단가는 경제 파라미터 설정값(기본값/글로벌/농장별)을 적용했습니다',
      '유지비·통신비·교체 주기는 포함하지 않은 초기 도입비 기준입니다',
    ],
    estimated: true,
  };
}
