// 휴약기간 계산기 테스트 — 순수 함수, DB 불필요
import { describe, it, expect } from 'vitest';
import { calculateWithdrawal } from '../../packages/server/src/services/vet/withdrawal-calculator.js';

describe('calculateWithdrawal — 휴약기간 계산', () => {
  it('1일 투약, 휴약 3일 → 투약일+3', () => {
    const result = calculateWithdrawal(new Date('2026-04-01'), 3, 1);
    expect(result.withdrawalEndDate).toBe('2026-04-04');
    expect(result.lastDoseDate).toBe('2026-04-01');
  });

  it('3일 투약, 휴약 5일 → 마지막투약(3일째)+5일', () => {
    const result = calculateWithdrawal(new Date('2026-04-01'), 5, 3);
    // 마지막 투약: 4/1 + 2 = 4/3
    // 휴약 종료: 4/3 + 5 = 4/8
    expect(result.lastDoseDate).toBe('2026-04-03');
    expect(result.withdrawalEndDate).toBe('2026-04-08');
  });

  it('휴약 0일 → 투약 종료일이 곧 출하 가능일', () => {
    const result = calculateWithdrawal(new Date('2026-04-01'), 0, 3);
    expect(result.withdrawalEndDate).toBe('2026-04-03');
    expect(result.lastDoseDate).toBe('2026-04-03');
  });

  it('durationDays 미지정 → 기본 1일', () => {
    const result = calculateWithdrawal(new Date('2026-04-10'), 7);
    expect(result.lastDoseDate).toBe('2026-04-10');
    expect(result.withdrawalEndDate).toBe('2026-04-17');
  });

  it('daysRemaining은 0 이상', () => {
    // 과거 날짜 → daysRemaining = 0
    const result = calculateWithdrawal(new Date('2025-01-01'), 3, 1);
    expect(result.daysRemaining).toBe(0);
  });
});
