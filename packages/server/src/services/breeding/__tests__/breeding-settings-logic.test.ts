import { describe, it, expect, vi } from 'vitest';

// DB·설정 모듈은 순수 함수 테스트에 필요 없다
vi.mock('../../../config/database.js', () => ({ getDb: vi.fn() }));
vi.mock('../../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { assessAbortionSignal } from '../breeding-insights.service.js';
import { extractBreedingSettings } from '../farm-settings-sync.service.js';

const DAY = 86_400_000;
const NOW = new Date('2026-11-01T00:00:00Z');
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * DAY);

const BASE = {
  now: NOW,
  gestationDays: 280,
  excludeDaysBeforeCalving: 60,
  intervalMinDays: 18,
  intervalMaxDays: 26,
};

describe('assessAbortionSignal — 유산 의심 판정', () => {
  it('직전 수정과 21일 간격 재발정 → 주기성 신호로 명시', () => {
    const v = assessAbortionSignal({
      ...BASE,
      inseminations: [daysAgo(61)],
      confirmedDate: daysAgo(45),
      latestEstrus: daysAgo(40),
      estrusDates: [daysAgo(40)],
    });
    expect(v.include).toBe(true);
    // 수정 61일 전 → 발정 40일 전 = 21일 간격
    expect(v.detail).toContain('21일 간격');
  });

  it('간격이 범위 밖이면 일반 유산 의심 문구', () => {
    const v = assessAbortionSignal({
      ...BASE,
      inseminations: [daysAgo(100)],
      confirmedDate: daysAgo(60),
      latestEstrus: daysAgo(5),
      estrusDates: [daysAgo(5)],
    });
    expect(v.include).toBe(true);
    expect(v.detail).not.toContain('주기성');
  });

  it('분만 예정 60일 이내면 제외 (smaXtec Abort suspected 규칙)', () => {
    // 수정 230일 전 → 분만 예정 50일 후
    const v = assessAbortionSignal({
      ...BASE,
      inseminations: [daysAgo(230)],
      confirmedDate: daysAgo(190),
      latestEstrus: daysAgo(2),
      estrusDates: [daysAgo(2)],
    });
    expect(v.include).toBe(false);
  });

  it('수정 기록이 없으면 제외 판단 없이 포함', () => {
    const v = assessAbortionSignal({
      ...BASE,
      inseminations: [],
      confirmedDate: daysAgo(30),
      latestEstrus: daysAgo(3),
      estrusDates: [daysAgo(3)],
    });
    expect(v.include).toBe(true);
  });
});

describe('extractBreedingSettings — smaXtec 응답 추출', () => {
  it('평면·중첩({settings}) 응답 모두 흡수, 숫자만 채택', () => {
    expect(extractBreedingSettings({ todo_dry_off_before_calving: 60, todo_gestation_days: '280' }))
      .toEqual({ dryOffBeforeCalvingDays: 60 });
    expect(extractBreedingSettings({ settings: { todo_long_open_days_dim: 175 } }))
      .toEqual({ longOpenDaysDim: 175 });
  });

  it('모르는 키만 있으면 빈 결과 (원본은 smaxtecRaw 로 보존)', () => {
    expect(extractBreedingSettings({ something_else: 1 })).toEqual({});
  });
});
