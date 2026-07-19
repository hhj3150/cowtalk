// 조치 기록률 순수 함수 테스트 — 비율·표본 부족 처리

import { describe, it, expect } from 'vitest';
import { computeRatePair, assembleActionRate } from './action-rate.service.js';

describe('computeRatePair', () => {
  it('확인율을 소수 1자리 %로 계산한다', () => {
    expect(computeRatePair(8, 5)).toEqual({ total: 8, acked: 5, ratePct: 62.5 });
    expect(computeRatePair(3, 3).ratePct).toBe(100);
    expect(computeRatePair(3, 0).ratePct).toBe(0);
  });

  it('표본 0이면 0%가 아니라 null (집계 불가)', () => {
    expect(computeRatePair(0, 0).ratePct).toBeNull();
  });
});

describe('assembleActionRate', () => {
  it('표본이 하나라도 있으면 ok', () => {
    const r = assembleActionRate(7, computeRatePair(5, 2), computeRatePair(0, 0), 3);
    expect(r.status).toBe('ok');
    expect(r.decisionsCompleted).toBe(3);
  });

  it('두 확인율 표본이 모두 0이면 data_insufficient', () => {
    const r = assembleActionRate(7, computeRatePair(0, 0), computeRatePair(0, 0), 0);
    expect(r.status).toBe('data_insufficient');
  });
});
