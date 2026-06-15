// 프로필 해시 — AI 해석 캐시 무효화 키
// AnimalProfile 전체를 결정적으로 직렬화한 뒤 sha256 → 데이터가 바뀌면 해시가 바뀐다.
// 보수적(전체 해시): 의미 없는 변경에도 재계산되지만, 누락 invalidation 보다 안전하다.

import { createHash } from 'node:crypto';
import type { AnimalProfile } from '@cowtalk/shared';

// 키를 재귀적으로 정렬해 직렬화 — 객체 키 삽입 순서에 무관한 안정 문자열을 만든다.
// Date 는 ISO 문자열로 직렬화(JSON.stringify 기본 동작과 동일).
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const entries = Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return `{${entries.join(',')}}`;
}

// 임의 프로필(객체)을 결정적으로 해시 — animal/regional 등 모든 캐시가 공용.
export function hashProfile(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function hashAnimalProfile(profile: AnimalProfile): string {
  return hashProfile(profile);
}
