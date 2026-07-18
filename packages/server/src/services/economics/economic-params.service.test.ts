// 경제 파라미터 병합·검증 테스트 — 기본 < 글로벌 < 농장 우선순위와 범위 검증

import { describe, it, expect } from 'vitest';
import { mergeParameterViews, validateParameterValue, type OverrideRow } from './economic-params.service.js';
import { ECONOMIC_PARAMETER_DEFS, ECONOMIC_PARAMETER_MAP } from '@cowtalk/shared';

const FARM_A = 'farm-a';
const NOW = new Date('2026-07-18T00:00:00Z');

function row(partial: Partial<OverrideRow> & Pick<OverrideRow, 'paramKey' | 'value'>): OverrideRow {
  return { farmId: null, updatedAt: NOW, ...partial };
}

describe('mergeParameterViews', () => {
  it('오버라이드가 없으면 카탈로그 기본값 전체를 default 출처로 반환한다', () => {
    const views = mergeParameterViews([], FARM_A);
    expect(views).toHaveLength(ECONOMIC_PARAMETER_DEFS.length);
    for (const v of views) {
      expect(v.value).toBe(ECONOMIC_PARAMETER_MAP[v.key].defaultValue);
      expect(v.source).toBe('default');
      expect(v.updatedAt).toBeNull();
    }
  });

  it('글로벌 오버라이드가 기본값을 덮어쓴다', () => {
    const views = mergeParameterViews([row({ paramKey: 'milk_price_krw_per_l', value: 1200 })], FARM_A);
    const milk = views.find((v) => v.key === 'milk_price_krw_per_l')!;
    expect(milk.value).toBe(1200);
    expect(milk.source).toBe('global');
    expect(milk.defaultValue).toBe(1084);
  });

  it('농장 오버라이드가 글로벌보다 우선한다', () => {
    const views = mergeParameterViews(
      [
        row({ paramKey: 'milk_price_krw_per_l', value: 1200 }),
        row({ farmId: FARM_A, paramKey: 'milk_price_krw_per_l', value: 1350 }),
      ],
      FARM_A,
    );
    const milk = views.find((v) => v.key === 'milk_price_krw_per_l')!;
    expect(milk.value).toBe(1350);
    expect(milk.source).toBe('farm');
  });

  it('다른 농장의 오버라이드는 적용하지 않는다', () => {
    const views = mergeParameterViews(
      [row({ farmId: 'farm-b', paramKey: 'milk_price_krw_per_l', value: 9999 })],
      FARM_A,
    );
    expect(views.find((v) => v.key === 'milk_price_krw_per_l')!.value).toBe(1084);
  });

  it('farmId 없이 호출하면 농장 오버라이드를 무시하고 글로벌까지만 병합한다', () => {
    const views = mergeParameterViews([
      row({ paramKey: 'open_day_cost_krw', value: 9000 }),
      row({ farmId: FARM_A, paramKey: 'open_day_cost_krw', value: 12000 }),
    ]);
    const open = views.find((v) => v.key === 'open_day_cost_krw')!;
    expect(open.value).toBe(9000);
    expect(open.source).toBe('global');
  });

  it('카탈로그에서 제거된(알 수 없는) 키의 행은 무시한다', () => {
    const views = mergeParameterViews([row({ paramKey: 'legacy_removed_key', value: 1 })], FARM_A);
    expect(views).toHaveLength(ECONOMIC_PARAMETER_DEFS.length);
    expect(views.every((v) => v.source === 'default')).toBe(true);
  });
});

describe('validateParameterValue', () => {
  it('카탈로그 범위 내 값은 통과한다', () => {
    expect(validateParameterValue('milk_price_krw_per_l', 1200)).toEqual({
      ok: true,
      key: 'milk_price_krw_per_l',
    });
  });

  it('알 수 없는 키는 거부한다', () => {
    const r = validateParameterValue('no_such_key', 100);
    expect(r.ok).toBe(false);
  });

  it('범위 밖 값은 거부한다 (min/max)', () => {
    expect(validateParameterValue('milk_price_krw_per_l', 50).ok).toBe(false);
    expect(validateParameterValue('milk_price_krw_per_l', 999999).ok).toBe(false);
  });

  it('NaN·Infinity 는 거부한다', () => {
    expect(validateParameterValue('milk_price_krw_per_l', Number.NaN).ok).toBe(false);
    expect(validateParameterValue('milk_price_krw_per_l', Number.POSITIVE_INFINITY).ok).toBe(false);
  });

  it('모든 카탈로그 기본값은 자기 자신의 허용 범위 안에 있다', () => {
    for (const def of ECONOMIC_PARAMETER_DEFS) {
      expect(validateParameterValue(def.key, def.defaultValue).ok).toBe(true);
    }
  });
});
