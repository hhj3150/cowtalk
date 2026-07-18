// ROI 실계산 테스트 — 파라미터 반영·수식 일관성·경계값

import { describe, it, expect } from 'vitest';
import { computeSensorRoi, ROI_EFFECT_ASSUMPTIONS } from './roi.service.js';
import { ECONOMIC_PARAMETER_DEFS } from '@cowtalk/shared';
import type { EconomicParameterKey } from '@cowtalk/shared';

const DEFAULTS = Object.fromEntries(
  ECONOMIC_PARAMETER_DEFS.map((d) => [d.key, d.defaultValue]),
) as Record<EconomicParameterKey, number>;

describe('computeSensorRoi', () => {
  it('초기 도입비 = 두수 × 센서 도입비 파라미터', () => {
    const roi = computeSensorRoi(50, DEFAULTS)!;
    expect(roi.initialCostKrw).toBe(50 * DEFAULTS.sensor_cost_per_head_krw);
  });

  it('연간 편익은 내역 합과 일치한다', () => {
    const roi = computeSensorRoi(87, DEFAULTS)!;
    const sum = roi.benefitBreakdown.reduce((s, b) => s + b.annualKrw, 0);
    expect(roi.annualBenefitKrw).toBe(sum);
    expect(roi.benefitBreakdown).toHaveLength(4);
  });

  it('파라미터를 올리면 편익이 커진다 (파라미터가 실제로 반영됨)', () => {
    const base = computeSensorRoi(50, DEFAULTS)!;
    const doubled = computeSensorRoi(50, {
      ...DEFAULTS,
      mastitis_case_loss_krw: DEFAULTS.mastitis_case_loss_krw * 2,
    })!;
    expect(doubled.annualBenefitKrw).toBeGreaterThan(base.annualBenefitKrw);
    expect(doubled.appliedParameters.mastitis_case_loss_krw).toBe(
      DEFAULTS.mastitis_case_loss_krw * 2,
    );
  });

  it('회수기간 = 초기비 / 연편익 × 12 (소수 1자리)', () => {
    const roi = computeSensorRoi(50, DEFAULTS)!;
    const expected = Math.round((roi.initialCostKrw / roi.annualBenefitKrw) * 12 * 10) / 10;
    expect(roi.paybackMonths).toBe(expected);
  });

  it('편익 0이면 회수기간 null, 도입비 0이면 ROI null', () => {
    const zeroBenefit = computeSensorRoi(50, {
      ...DEFAULTS,
      mastitis_case_loss_krw: 0,
      ketosis_case_loss_krw: 0,
      open_day_cost_krw: 0,
      adult_death_loss_krw: 0,
    })!;
    expect(zeroBenefit.paybackMonths).toBeNull();

    const zeroCost = computeSensorRoi(50, { ...DEFAULTS, sensor_cost_per_head_krw: 0 })!;
    expect(zeroCost.fiveYearRoiPct).toBeNull();
  });

  it('잘못된 두수는 null (0, 음수, NaN, 상한 초과)', () => {
    expect(computeSensorRoi(0, DEFAULTS)).toBeNull();
    expect(computeSensorRoi(-5, DEFAULTS)).toBeNull();
    expect(computeSensorRoi(Number.NaN, DEFAULTS)).toBeNull();
    expect(computeSensorRoi(200000, DEFAULTS)).toBeNull();
  });

  it('가정·추정 표기를 항상 포함한다 (정직성)', () => {
    const roi = computeSensorRoi(50, DEFAULTS)!;
    expect(roi.estimated).toBe(true);
    expect(roi.assumptions.length).toBeGreaterThan(0);
    expect(roi.assumptions.join(' ')).toContain('실측치가 아닙니다');
    for (const b of roi.benefitBreakdown) {
      expect(b.formula.length).toBeGreaterThan(0);
    }
  });

  it('효과 계수는 보수적 범위를 벗어나지 않는다 (가드)', () => {
    expect(ROI_EFFECT_ASSUMPTIONS.mastitisLossReduction).toBeLessThanOrEqual(0.5);
    expect(ROI_EFFECT_ASSUMPTIONS.ketosisLossReduction).toBeLessThanOrEqual(0.5);
    expect(ROI_EFFECT_ASSUMPTIONS.openDaysSavedPerHeadYear).toBeLessThanOrEqual(15);
    expect(ROI_EFFECT_ASSUMPTIONS.adultDeathReductionPerYear).toBeLessThanOrEqual(0.01);
  });
});
