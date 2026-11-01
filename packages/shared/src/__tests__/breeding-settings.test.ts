import { describe, it, expect } from 'vitest';
import {
  BREEDING_SETTING_DEFS,
  applyManualPatch,
  buildBreedingSettingViews,
  mergeSmaxtecSettings,
  resolveBreedingSettings,
  validateBreedingSettingsPatch,
} from '../constants/breeding-settings.js';
import type { StoredBreedingSettings } from '../types/breeding-settings.js';

const NOW = new Date('2026-11-01T00:00:00Z');

/** 송영신목장 smaXtec 대시보드 실값 (0039 마이그레이션과 동일) */
const SONGYEONGSIN = {
  unacknowledgedHealthAlertHours: 48, heatListHours: 36, estrusRecurrenceDays: 20,
  minBreedingAgeMonths: 12, estrusDetectionAfterDim: 20, inseminationWindowStartHours: 10,
  inseminationWindowEndHours: 18, pregnancyCheckDays: 40, gestationDays: 280,
  heatDetectionDuringPregnancy: 0, pregnantHeatIntervalMinDays: 18, pregnantHeatIntervalMaxDays: 26,
  abortSuspectExcludeDaysBeforeCalving: 60, dryOffBeforeCalvingDays: 60, calvingSoonDays: 14,
  healthAlertListHours: 36, healthGraphDays: 7, freshCowDim: 30, noHeatDim: 50, longOpenDaysDim: 175,
} as const;

describe('카탈로그', () => {
  it('기본값·smaXtec 기본값이 허용 범위 안이다', () => {
    for (const d of BREEDING_SETTING_DEFS) {
      for (const v of [d.defaultValue, d.smaxtecDefault]) {
        if (v === null) {
          expect(d.nullable, `${d.key} null 기본값인데 nullable 아님`).toBe(true);
          continue;
        }
        expect(v, d.key).toBeGreaterThanOrEqual(d.min);
        expect(v, d.key).toBeLessThanOrEqual(d.max);
      }
    }
  });

  it('기존 하드코딩 기본값을 유지한다 (비파괴)', () => {
    const r = resolveBreedingSettings({});
    expect(r.dryOffBeforeCalvingDays).toBe(90);
    expect(r.longOpenDaysDim).toBe(200);
    expect(r.pregnancyCheckDays).toBe(28);
    expect(r.calvingSoonDays).toBe(7);
    expect(r.noHeatDim).toBe(50);
  });

  it('송영신목장 실값이 전부 검증을 통과한다', () => {
    const v = validateBreedingSettingsPatch(SONGYEONGSIN, {});
    expect(v.ok).toBe(true);
  });
});

describe('resolveBreedingSettings', () => {
  it('빈 저장({})·null 은 기본값 — 종전 버그(빈 객체가 truthy 라 기본값 미적용) 방지', () => {
    expect(resolveBreedingSettings(null).gestationDays).toBe(280);
    expect(resolveBreedingSettings({}).gestationDays).toBe(280);
  });

  it('깨진 값(문자열·NaN)은 기본값으로', () => {
    const r = resolveBreedingSettings({ gestationDays: 'x' as unknown as number, longOpenDaysDim: Number.NaN });
    expect(r.gestationDays).toBe(280);
    expect(r.longOpenDaysDim).toBe(200);
  });

  it('nullable 키만 null 을 유지한다', () => {
    const r = resolveBreedingSettings({ sexedSemenWindowStartHours: null, gestationDays: null });
    expect(r.sexedSemenWindowStartHours).toBeNull();
    expect(r.gestationDays).toBe(280);
  });
});

describe('직접 입력 / smaXtec 병합', () => {
  it('직접 입력 → 출처 manual, 해제(null) → 기본값으로 복귀', () => {
    const s1 = applyManualPatch({}, { dryOffBeforeCalvingDays: 60 }, 'u1', NOW);
    expect(resolveBreedingSettings(s1).dryOffBeforeCalvingDays).toBe(60);
    expect(buildBreedingSettingViews(s1).find((v) => v.key === 'dryOffBeforeCalvingDays')?.source).toBe('manual');
    expect(s1.manualUpdatedBy).toBe('u1');

    const s2 = applyManualPatch(s1, { dryOffBeforeCalvingDays: null }, 'u1', NOW);
    expect(resolveBreedingSettings(s2).dryOffBeforeCalvingDays).toBe(90);
    expect(s2.manualKeys).not.toContain('dryOffBeforeCalvingDays');
  });

  it('smaXtec 동기화는 직접 입력한 키를 덮어쓰지 않는다', () => {
    const manual = applyManualPatch({}, { longOpenDaysDim: 175 }, 'u1', NOW);
    const merged = mergeSmaxtecSettings(manual, { longOpenDaysDim: 200, pregnancyCheckDays: 40 }, { a: 1 }, NOW);
    const r = resolveBreedingSettings(merged);
    expect(r.longOpenDaysDim).toBe(175);
    expect(r.pregnancyCheckDays).toBe(40);
    const views = buildBreedingSettingViews(merged);
    expect(views.find((v) => v.key === 'pregnancyCheckDays')?.source).toBe('smaxtec');
    expect(merged.smaxtecRaw).toEqual({ a: 1 });
    expect(merged.syncedAt).toBe(NOW.toISOString());
  });

  it('smaXtec 값이 범위 밖이면 버린다 (잘못 매핑된 키 방어)', () => {
    const merged = mergeSmaxtecSettings({}, { gestationDays: 9999 }, {}, NOW);
    expect(resolveBreedingSettings(merged).gestationDays).toBe(280);
  });
});

describe('validateBreedingSettingsPatch', () => {
  it('알 수 없는 키·범위 밖·소수·빈 패치 거부', () => {
    expect(validateBreedingSettingsPatch({ foo: 1 }, {}).ok).toBe(false);
    expect(validateBreedingSettingsPatch({ gestationDays: 400 }, {}).ok).toBe(false);
    expect(validateBreedingSettingsPatch({ gestationDays: 280.5 }, {}).ok).toBe(false);
    expect(validateBreedingSettingsPatch({}, {}).ok).toBe(false);
    expect(validateBreedingSettingsPatch(null, {}).ok).toBe(false);
  });

  it('교차 조건 — 수정 적기 시작 < 종료 (한쪽만 바꿔도 검사)', () => {
    expect(validateBreedingSettingsPatch({ inseminationWindowStartHours: 20 }, {}).ok).toBe(false);
    const current: StoredBreedingSettings = { inseminationWindowEndHours: 24 };
    expect(validateBreedingSettingsPatch({ inseminationWindowStartHours: 20 }, current).ok).toBe(true);
  });

  it('성감별 수정 적기는 둘 다 입력하거나 둘 다 비워야 한다', () => {
    expect(validateBreedingSettingsPatch({ sexedSemenWindowStartHours: 12 }, {}).ok).toBe(false);
    expect(validateBreedingSettingsPatch({ sexedSemenWindowStartHours: 12, sexedSemenWindowEndHours: 20 }, {}).ok).toBe(true);
  });

  it('유산 의심 간격 최소 < 최대', () => {
    expect(validateBreedingSettingsPatch({ pregnantHeatIntervalMinDays: 30 }, {}).ok).toBe(false);
  });
});
