// RBAC 농장 스코프 헬퍼 테스트 — scopedFarmIds(req)
// 멀티테넌시 데이터 격리: 배정된 농장만 보여야 하는 역할 vs 전체 조회 역할 구분

import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { scopedFarmIds, requireFarmAccess, NO_FARM_SENTINEL } from '../rbac.js';

function makeReq(user: Record<string, unknown> | undefined): Request {
  return { user } as unknown as Request;
}

describe('scopedFarmIds', () => {
  it('미인증 요청(user 없음)은 null(제한 없음)', () => {
    expect(scopedFarmIds(makeReq(undefined))).toBeNull();
  });

  it('government_admin(마스터)이 미배정이면 null — 전체 농장 조회', () => {
    const req = makeReq({ userId: 'u1', role: 'government_admin', farmIds: [] });
    expect(scopedFarmIds(req)).toBeNull();
  });

  it('배정 우선: government_admin이라도 농장 배정되면 그 농장만 스코프', () => {
    const req = makeReq({ userId: 'u1b', role: 'government_admin', farmIds: ['fa', 'fb'] });
    expect(scopedFarmIds(req)).toEqual(['fa', 'fb']);
  });

  it('배정 우선: quarantine_officer(방역관)도 농장 배정되면 그 농장만 스코프', () => {
    const req = makeReq({ userId: 'u2', role: 'quarantine_officer', farmIds: ['f1'] });
    expect(scopedFarmIds(req)).toEqual(['f1']);
  });

  it('quarantine_officer가 미배정이면 null — 전국 조회', () => {
    const req = makeReq({ userId: 'u2b', role: 'quarantine_officer', farmIds: [] });
    expect(scopedFarmIds(req)).toBeNull();
  });

  it('veterinarian이 2개 농장 배정 → 그 2개로 스코프', () => {
    const req = makeReq({ userId: 'u3', role: 'veterinarian', farmIds: ['fa', 'fb'] });
    expect(scopedFarmIds(req)).toEqual(['fa', 'fb']);
  });

  it('farmer가 1개 농장 배정 → 그 1개로 스코프', () => {
    const req = makeReq({ userId: 'u4', role: 'farmer', farmIds: ['only'] });
    expect(scopedFarmIds(req)).toEqual(['only']);
  });

  it('미배정 수의사는 센티널 스코프 — 아무 목장도 볼 수 없다', () => {
    const req = makeReq({ userId: 'u5', role: 'veterinarian', farmIds: [] });
    expect(scopedFarmIds(req)).toEqual([NO_FARM_SENTINEL]);
  });

  it('farmIds 미정의 농장주도 센티널 스코프 — 전체 접근 금지', () => {
    const req = makeReq({ userId: 'u6', role: 'farmer' });
    expect(scopedFarmIds(req)).toEqual([NO_FARM_SENTINEL]);
  });
});

describe('requireFarmAccess — 미배정 farm-scoped 사용자', () => {
  function run(user: Record<string, unknown>, query: Record<string, string> = {}, params: Record<string, string> = {}): { error?: Error; passed: boolean } {
    const req = { user, query, params } as unknown as Request;
    let passed = false;
    try {
      requireFarmAccess(req, {} as never, () => { passed = true; });
      return { passed };
    } catch (e) {
      return { error: e as Error, passed };
    }
  }

  it('미배정 농장주가 특정 farmId를 요청하면 403', () => {
    const r = run({ userId: 'u7', role: 'farmer', farmIds: [] }, { farmId: 'f1' });
    expect(r.passed).toBe(false);
    expect(r.error?.message).toContain('배정된 목장이 없습니다');
  });

  it('미배정 수의사가 params.farmId로 요청해도 403', () => {
    const r = run({ userId: 'u8', role: 'veterinarian', farmIds: [] }, {}, { farmId: 'f1' });
    expect(r.passed).toBe(false);
  });

  it('미배정 농장주의 전체 조회(farmId 없음)는 통과 — 데이터는 센티널 스코프로 빈 결과', () => {
    const r = run({ userId: 'u9', role: 'farmer', farmIds: [] });
    expect(r.passed).toBe(true);
  });

  it('배정된 농장주는 자기 농장 요청 통과, 남의 농장 403', () => {
    expect(run({ userId: 'u10', role: 'farmer', farmIds: ['mine'] }, { farmId: 'mine' }).passed).toBe(true);
    expect(run({ userId: 'u10', role: 'farmer', farmIds: ['mine'] }, { farmId: 'others' }).passed).toBe(false);
  });

  it('관리 역할(행정·방역관)은 미배정이어도 전체 접근 유지', () => {
    expect(run({ userId: 'u11', role: 'government_admin', farmIds: [] }, { farmId: 'any' }).passed).toBe(true);
    expect(run({ userId: 'u12', role: 'quarantine_officer', farmIds: [] }, { farmId: 'any' }).passed).toBe(true);
  });
});
