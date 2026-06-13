// farm-settings-context 테스트 — 목장 번식 설정 프롬프트 주입 (CLAUDE.md 명시 요구)

import { describe, it, expect } from 'vitest';
import { buildFarmBreedingContext } from '../farm-settings-context.js';
import type { FarmBreedingSettings } from '../../../db/schema.js';

describe('buildFarmBreedingContext', () => {
  it('헤더와 "이 농장 고유값 기준" 지시를 포함한다', () => {
    const out = buildFarmBreedingContext({ estrusRecurrenceDays: 21 });
    expect(out).toContain('목장 번식 설정');
    // AI가 일반론이 아니라 목장값 기준으로 판단하도록 강제하는 문구
    expect(out).toMatch(/이 농장|목장 고유|기준으로 판단/);
  });

  it('목장이 지정한 값을 그대로 노출한다', () => {
    const settings: FarmBreedingSettings = {
      estrusRecurrenceDays: 21,
      inseminationWindowStartHours: 10,
      inseminationWindowEndHours: 18,
      pregnancyCheckDays: 28,
      gestationDays: 280,
      longOpenDaysDim: 200,
    };
    const out = buildFarmBreedingContext(settings);
    expect(out).toContain('21'); // 발정재귀일
    expect(out).toContain('10~18'); // 수정 적기
    expect(out).toContain('28'); // 임신감정 시기
    expect(out).toContain('200'); // 장기공태우 기준
  });

  it('누락된 키는 기본값으로 채우되 "기본값"으로 표기한다', () => {
    // estrusRecurrenceDays만 지정 → 나머지는 기본값
    const out = buildFarmBreedingContext({ estrusRecurrenceDays: 19 });
    expect(out).toContain('19'); // 목장 지정값
    expect(out).toContain('기본값'); // 누락 키는 기본값 표기
  });

  it('성감별 정액 미사용(null)이면 "미사용"으로 표기', () => {
    const out = buildFarmBreedingContext({
      sexedSemenWindowStartHours: null,
      sexedSemenWindowEndHours: null,
    });
    expect(out).toContain('미사용');
  });

  it('성감별 정액 사용 시 시간 범위를 노출', () => {
    const out = buildFarmBreedingContext({
      sexedSemenWindowStartHours: 14,
      sexedSemenWindowEndHours: 20,
    });
    expect(out).toContain('14~20');
  });

  it('null/undefined/빈 설정이면 전부 기본값 블록을 반환한다(크래시 없음)', () => {
    for (const empty of [null, undefined, {} as FarmBreedingSettings]) {
      const out = buildFarmBreedingContext(empty);
      expect(out).toContain('목장 번식 설정');
      expect(out).toContain('기본값');
      // 기본 발정재귀일 21이 들어가야 함
      expect(out).toContain('21');
    }
  });
});
