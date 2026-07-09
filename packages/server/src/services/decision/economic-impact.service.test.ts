// 경제 환산 순수 함수 테스트 — 실측 없으면 null, 항상 estimated 표기

import { describe, it, expect } from 'vitest';
import { estimateDailyLoss, DEFAULT_MILK_PRICE_KRW_PER_L } from './economic-impact.service.js';

describe('estimateDailyLoss', () => {
  it('실측 유량 × 손실률 × 단가로 일 손실을 계산한다', () => {
    const r = estimateDailyLoss(30, 0.1);
    expect(r).not.toBeNull();
    expect(r!.dailyLossKrw).toBe(Math.round(30 * 0.1 * DEFAULT_MILK_PRICE_KRW_PER_L));
    expect(r!.lossFractionPct).toBe(10);
    expect(r!.basisYieldL).toBe(30);
    expect(r!.estimated).toBe(true);
  });

  it('유량이 0 이하거나 비정상이면 null — 추정 유량 기반 계산 금지', () => {
    expect(estimateDailyLoss(0, 0.1)).toBeNull();
    expect(estimateDailyLoss(-5, 0.1)).toBeNull();
    expect(estimateDailyLoss(Number.NaN, 0.1)).toBeNull();
  });

  it('손실률이 범위(0,1] 밖이면 null', () => {
    expect(estimateDailyLoss(30, 0)).toBeNull();
    expect(estimateDailyLoss(30, 1.5)).toBeNull();
  });

  it('단가 오버라이드가 반영된다', () => {
    const r = estimateDailyLoss(20, 0.05, 1200);
    expect(r!.priceKrwPerL).toBe(1200);
    expect(r!.dailyLossKrw).toBe(Math.round(20 * 0.05 * 1200));
  });
});
