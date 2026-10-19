// 번식 서비스 공용 — 농장 범위 조건 (SEC-08)
//
// 라우트가 넘기는 범위: 단일 farmId(문자열) · 허용 농장 목록(배열) · undefined(전체, 무제한 사용자만).
// 다목장 수의사가 "전체 보기"로 호출해도 자기 담당 농장 안에서만 집계되게 배열을 받는다.

import { eq, inArray } from 'drizzle-orm';
import { animals } from '../../db/schema.js';

export type BreedingFarmScope = string | readonly string[] | undefined;

export function animalFarmCondition(scope: BreedingFarmScope): ReturnType<typeof eq> | undefined {
  if (scope === undefined) return undefined;
  if (typeof scope === 'string') return eq(animals.farmId, scope);
  return inArray(animals.farmId, [...scope]);
}

/** 로그·설정 조회용 단일 farmId (배열이면 하나일 때만) */
export function singleFarmId(scope: BreedingFarmScope): string | undefined {
  if (typeof scope === 'string') return scope;
  return scope && scope.length === 1 ? scope[0] : undefined;
}
