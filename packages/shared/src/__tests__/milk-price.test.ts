// 유대단가·사료비 순수 함수 테스트

import { describe, it, expect } from 'vitest';
import { computeMilkPricePerL, computeDailyFeedCost, MILK_FAT_BASE_PCT } from '../utils/milk-price.js';

const BASE = {
  basePriceKrwPerL: 1084,
  fatAdjustKrwPer01Pct: 10,
  sccGrade1BonusKrwPerL: 50,
};

describe('computeMilkPricePerL', () => {
  it('유성분 없으면 기본가 그대로', () => {
    const r = computeMilkPricePerL({ ...BASE });
    expect(r.pricePerL).toBe(1084);
    expect(r.fatAdjustKrw).toBe(0);
    expect(r.sccBonusKrw).toBe(0);
    expect(r.estimated).toBe(true);
  });

  it('유지방 3.9% → 기준 3.4% 대비 +0.5%p = +50원', () => {
    const r = computeMilkPricePerL({ ...BASE, avgFatPct: 3.9 });
    expect(r.fatAdjustKrw).toBe(50);
    expect(r.pricePerL).toBe(1134);
  });

  it('유지방 미달이면 감액된다', () => {
    const r = computeMilkPricePerL({ ...BASE, avgFatPct: 3.0 });
    expect(r.fatAdjustKrw).toBe(-40);
    expect(r.pricePerL).toBe(1044);
  });

  it('체세포 200천/mL 이하면 1등급 가산, 초과면 0', () => {
    expect(computeMilkPricePerL({ ...BASE, avgSccThousand: 180 }).sccBonusKrw).toBe(50);
    expect(computeMilkPricePerL({ ...BASE, avgSccThousand: 250 }).sccBonusKrw).toBe(0);
  });

  it('산정 근거 formula에 기본가·가감이 노출된다', () => {
    const r = computeMilkPricePerL({ ...BASE, avgFatPct: 3.9, avgSccThousand: 180 });
    expect(r.formula).toContain('기본가');
    expect(r.formula).toContain('유지방');
    expect(r.formula).toContain('체세포');
  });

  it('기준치 상수는 3.4%다 (국내 원유 기본가 기준)', () => {
    expect(MILK_FAT_BASE_PCT).toBe(3.4);
  });
});

describe('computeDailyFeedCost', () => {
  it('두당 일 사료비 = Σ(급여량×단가)', () => {
    expect(computeDailyFeedCost([
      { name: '옥수수 사일리지', amountKgPerDay: 20, costPerKg: 80 },
      { name: '알팔파', amountKgPerDay: 3, costPerKg: 600 },
      { name: '농후사료', amountKgPerDay: 8, costPerKg: 550 },
    ])).toBe(20 * 80 + 3 * 600 + 8 * 550);
  });

  it('음수·NaN 값은 0으로 취급한다', () => {
    expect(computeDailyFeedCost([
      { name: 'x', amountKgPerDay: -5, costPerKg: 100 },
      { name: 'y', amountKgPerDay: 10, costPerKg: Number.NaN },
    ])).toBe(0);
  });

  it('빈 배합은 0원', () => {
    expect(computeDailyFeedCost([])).toBe(0);
  });
});
