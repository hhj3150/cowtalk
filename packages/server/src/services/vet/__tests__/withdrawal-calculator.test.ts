// DI-01 회귀 — 휴약기간 계산 (KST 기준·시간 단위·약품별 원유/식육)
import { describe, it, expect } from 'vitest';
import {
  calculateWithdrawal, resolveWithdrawalDays, kstDateString, endOfKstDay,
} from '../withdrawal-calculator.js';

// 2026-10-20 08:00 KST = 2026-10-19 23:00 UTC (서버 UTC 기준으로는 "전날")
const KST_0800 = new Date('2026-10-19T23:00:00Z');

describe('DI-01 calculateWithdrawal', () => {
  it('KST 오전 기록 — UTC 날짜로 하루 당겨지지 않는다 (예전 버그 재현 케이스)', () => {
    const r = calculateWithdrawal(KST_0800, 3, 1, KST_0800);
    expect(r.lastDoseDate).toBe('2026-10-20');       // 예전: 2026-10-19 (UTC 날짜)
    expect(r.withdrawalEndDate).toBe('2026-10-23');  // 예전: 2026-10-22 → 하루 일찍 출하
    expect(r.withdrawalEndAt).toBe('2026-10-22T23:00:00.000Z'); // = 10-23 08:00 KST, 정확히 72시간
  });

  it('시간 단위 — 종료 시각 1분 전에는 출하 불가, 종료 시각에는 가능', () => {
    const end = new Date('2026-10-22T23:00:00Z');
    expect(calculateWithdrawal(KST_0800, 3, 1, new Date(end.getTime() - 60_000)).clearForShipment).toBe(false);
    expect(calculateWithdrawal(KST_0800, 3, 1, new Date(end.getTime() - 60_000)).daysRemaining).toBe(1);
    expect(calculateWithdrawal(KST_0800, 3, 1, end).clearForShipment).toBe(true);
    expect(calculateWithdrawal(KST_0800, 3, 1, end).daysRemaining).toBe(0);
  });

  it('여러 날 투약 — 마지막 날 투약 시각을 모르면 그날 KST 23:59:59 로 보수적 가정', () => {
    // 첫 투약 10-20 08:00 KST, 3일 투약 → 마지막 투약일 10-22, 23:59:59 KST 가정, 휴약 2일
    const r = calculateWithdrawal(KST_0800, 2, 3, KST_0800);
    expect(r.lastDoseDate).toBe('2026-10-22');
    expect(r.withdrawalEndAt).toBe('2026-10-24T14:59:59.999Z'); // 10-24 23:59:59 KST
    expect(r.withdrawalEndDate).toBe('2026-10-24');
  });

  it('KST 자정 직전·직후 경계', () => {
    expect(kstDateString(new Date('2026-10-19T14:59:59Z'))).toBe('2026-10-19');
    expect(kstDateString(new Date('2026-10-19T15:00:00Z'))).toBe('2026-10-20');
    expect(endOfKstDay(new Date('2026-10-19T15:00:00Z')).toISOString()).toBe('2026-10-20T14:59:59.999Z');
  });

  it('월말 경계도 정확 (10-31 → 11-02)', () => {
    const at = new Date('2026-10-31T01:00:00Z'); // 10-31 10:00 KST
    expect(calculateWithdrawal(at, 2, 1, at).withdrawalEndDate).toBe('2026-11-02');
  });

  it('휴약 0일·음수는 마지막 투약 시각에 종료', () => {
    expect(calculateWithdrawal(KST_0800, 0, 1, KST_0800).clearForShipment).toBe(true);
    expect(calculateWithdrawal(KST_0800, -5, 1, KST_0800).withdrawalEndAt).toBe(KST_0800.toISOString());
  });
});

describe('DI-01 resolveWithdrawalDays — 약품별 원유·식육 기준', () => {
  it('약품 DB에 없으면 입력값을 원유·식육 모두에 적용', () => {
    expect(resolveWithdrawalDays(3, null)).toMatchObject({ milkDays: 3, meatDays: 3, basis: 'entered' });
  });

  it('입력이 약품 기준보다 짧으면 기준값으로 올리고 경고', () => {
    const r = resolveWithdrawalDays(2, { milkDays: 4, meatDays: 28 });
    expect(r).toMatchObject({ milkDays: 4, meatDays: 28, basis: 'entered_and_drug_database' });
    expect(r.warnings).toHaveLength(2);
  });

  it('입력이 더 길면 입력값 유지 (수의사 판단 존중)', () => {
    expect(resolveWithdrawalDays(30, { milkDays: 4, meatDays: 28 })).toMatchObject({ milkDays: 30, meatDays: 30 });
  });

  it('입력이 없어도 약품 기준이 있으면 휴약을 건다 (예전: 휴약 미계산)', () => {
    expect(resolveWithdrawalDays(undefined, { milkDays: 3, meatDays: 14 })).toMatchObject({ milkDays: 3, meatDays: 14, basis: 'drug_database' });
    expect(resolveWithdrawalDays(0, { milkDays: 3, meatDays: 14 })).toMatchObject({ milkDays: 3, meatDays: 14 });
  });
});
