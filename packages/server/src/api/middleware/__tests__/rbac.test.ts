// RBAC 농장 스코프 헬퍼 테스트 — scopedFarmIds(req)
// 멀티테넌시 데이터 격리: 배정된 농장만 보여야 하는 역할 vs 전체 조회 역할 구분

import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { scopedFarmIds } from '../rbac.js';

function makeReq(user: Record<string, unknown> | undefined): Request {
  return { user } as unknown as Request;
}

describe('scopedFarmIds', () => {
  it('미인증 요청(user 없음)은 null(제한 없음)', () => {
    expect(scopedFarmIds(makeReq(undefined))).toBeNull();
  });

  it('government_admin(마스터)은 null — 전체 농장 조회', () => {
    const req = makeReq({ userId: 'u1', role: 'government_admin', farmIds: [] });
    expect(scopedFarmIds(req)).toBeNull();
  });

  it('quarantine_officer(방역관)은 null — 전국 조회', () => {
    const req = makeReq({ userId: 'u2', role: 'quarantine_officer', farmIds: ['f1'] });
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

  it('미배정(farmIds 빈 배열) 비관리 역할은 null — 기존 동작 보존', () => {
    const req = makeReq({ userId: 'u5', role: 'veterinarian', farmIds: [] });
    expect(scopedFarmIds(req)).toBeNull();
  });

  it('farmIds 미정의도 null로 처리', () => {
    const req = makeReq({ userId: 'u6', role: 'farmer' });
    expect(scopedFarmIds(req)).toBeNull();
  });
});
