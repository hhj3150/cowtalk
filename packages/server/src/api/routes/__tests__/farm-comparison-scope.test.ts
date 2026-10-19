// SEC-01 회귀 — /unified-dashboard/farm-comparison 의 farmIds 파라미터
//
// 재현하던 위험:
//   1) farmIds 값을 따옴표로 감싸 sql.raw 로 IN 절에 이어 붙였다 → SQL Injection
//   2) 배정 스코프를 보지 않아 농장주·수의사가 다른 목장 id를 넣으면 그 목장 지표가 보였다
//   3) 파라미터가 없으면 전국 상위 3개 목장을 돌려줬다 (권한과 무관)

import { describe, it, expect, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { inArray } from 'drizzle-orm';
import { farms } from '../../../db/schema.js';

vi.mock('../../../config/database.js', () => ({ getDb: () => ({}) }));

const { resolveComparisonFarmIds } = await import('../unified-dashboard.routes.js');

const MY_FARM = '11111111-1111-4111-8111-111111111111';
const MY_FARM_2 = '22222222-2222-4222-8222-222222222222';
const OTHER_FARM = '99999999-9999-4999-8999-999999999999';

describe('SEC-01 resolveComparisonFarmIds', () => {
  it('유효한 UUID는 통과 (무제한 스코프)', () => {
    expect(resolveComparisonFarmIds(MY_FARM, null)).toEqual({ mode: 'explicit', farmIds: [MY_FARM] });
  });

  it('UUID가 아닌 값은 버린다', () => {
    expect(resolveComparisonFarmIds('abc,123', null)).toEqual({ mode: 'explicit', farmIds: [] });
  });

  it('SQL 조각이 섞인 값은 통째로 버린다 — 상위 3개로 대체하지도 않는다', () => {
    const attack = `${MY_FARM}') OR 1=1 --,x'); DROP TABLE farms; --`;
    const r = resolveComparisonFarmIds(attack, null);
    expect(r).toEqual({ mode: 'explicit', farmIds: [] });
  });

  it('권한 밖 목장 id는 제외된다 (농장주가 다른 목장 조회)', () => {
    expect(resolveComparisonFarmIds(OTHER_FARM, [MY_FARM])).toEqual({ mode: 'explicit', farmIds: [] });
  });

  it('여러 개 중 권한 안의 것만 남긴다 + 중복 제거 + 대소문자 무관', () => {
    const r = resolveComparisonFarmIds(`${MY_FARM},${OTHER_FARM},${MY_FARM_2.toUpperCase()},${MY_FARM}`, [MY_FARM, MY_FARM_2]);
    expect(r).toEqual({ mode: 'explicit', farmIds: [MY_FARM, MY_FARM_2] });
  });

  it('미배정 농장주(NO_FARM_SENTINEL 스코프)는 아무 목장도 못 본다', () => {
    const sentinel = '00000000-0000-0000-0000-000000000000';
    expect(resolveComparisonFarmIds(MY_FARM, [sentinel])).toEqual({ mode: 'explicit', farmIds: [] });
  });

  it('파라미터가 없거나 비면 상위 목장 모드 (라우트가 스코프 안에서만 고른다)', () => {
    expect(resolveComparisonFarmIds(undefined, [MY_FARM])).toEqual({ mode: 'top' });
    expect(resolveComparisonFarmIds('  ', null)).toEqual({ mode: 'top' });
  });

  it('요청 개수 상한 10개', () => {
    const many = Array.from({ length: 15 }, (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`).join(',');
    const r = resolveComparisonFarmIds(many, null);
    expect(r.mode === 'explicit' && r.farmIds.length).toBe(10);
  });
});

describe('SEC-01 쿼리는 값을 파라미터로 바인딩한다', () => {
  it('inArray 는 IN 절에 값을 문자열로 이어 붙이지 않는다', () => {
    const q = new PgDialect().sqlToQuery(inArray(farms.farmId, [MY_FARM, "x') OR 1=1 --"]).getSQL());
    expect(q.sql).not.toContain('OR 1=1');
    expect(q.params).toContain("x') OR 1=1 --");
  });
});
