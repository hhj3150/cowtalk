// resolveScopedFarmIds — 대시보드 유효 farmIds 합성 로직 (데이터 격리 핵심)
//
// 배경: Express 5에서 enforceFarmScope의 req.query 주입이 소실돼 대시보드가 전국 누수.
// 이 헬퍼가 storage 시드 단계에서 배정 실링을 강제한다 (배정 우선 규칙).

import { describe, it, expect } from 'vitest';
import { resolveScopedFarmIds } from '../rbac.js';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

describe('resolveScopedFarmIds — 배정 우선 스코프 합성', () => {
  it('마스터(scope=null) + 미선택 → 빈 배열(전체 조회)', () => {
    expect(resolveScopedFarmIds([], null)).toEqual([]);
  });

  it('마스터(scope=null) + 특정 농장 요청 → 요청대로', () => {
    expect(resolveScopedFarmIds([A], null)).toEqual([A]);
  });

  it('배정 사용자(scope=[A,B]) + 미선택 → 배정 농장 전체', () => {
    expect(resolveScopedFarmIds([], [A, B])).toEqual([A, B]);
  });

  it('배정 사용자(scope=[A,B]) + 배정 내 1개 요청 → 그 농장만', () => {
    expect(resolveScopedFarmIds([A], [A, B])).toEqual([A]);
  });

  it('배정 사용자(scope=[A,B]) + 배정 밖 농장 요청 → 전체로 확대 금지, 배정 전체로 폴백', () => {
    expect(resolveScopedFarmIds([C], [A, B])).toEqual([A, B]);
  });

  it('배정 사용자(scope=[A,B]) + 혼합 요청 → 배정 내 교집합만', () => {
    expect(resolveScopedFarmIds([A, C], [A, B])).toEqual([A]);
  });

  it('배정 사용자(scope=[A]) + 미선택 → 배정 1개 (절대 빈 배열/전체 아님)', () => {
    const result = resolveScopedFarmIds([], [A]);
    expect(result).toEqual([A]);
    expect(result.length).toBeGreaterThan(0);
  });
});
