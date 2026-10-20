// SEC-21 회귀 — OPEN_DATA_SCOPE 가 모든 승인 계정에 isMaster 를 줘서 '데이터 공개'가 아니라
// 사용자 관리·플랫폼 관리 권한까지 열던 문제
import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../../config/index.js', async (orig) => {
  const actual = await orig<typeof import('../../../config/index.js')>();
  return { ...actual, config: { ...actual.config, OPEN_DATA_SCOPE: true } };
});
const { tokenScopeFor, OWNER_EMAILS } = await import('../../../services/auth/approval.service.js');
const { scopedFarmIds, requirePlatformAdmin, requireRoleOrMaster, hasAllFarmScope } = await import('../rbac.js');
const { socketRoomsFor } = await import('../../../realtime/socket-server.js');

const farmerOpen = { userId: 'u', role: 'farmer', farmIds: [], ...tokenScopeFor('farmer@example.com', []) };
const reqOf = (user: object) => ({ user } as unknown as Request);

describe('SEC-21 OPEN_DATA_SCOPE', () => {
  it('열람 토큰은 isMaster 가 아니다', () => {
    expect(farmerOpen).toMatchObject({ openScope: true });
    expect(farmerOpen).not.toHaveProperty('isMaster');
  });
  it('데이터 범위는 전체 (기존 동작 유지)', () => {
    expect(scopedFarmIds(reqOf(farmerOpen))).toBeNull();
    expect(hasAllFarmScope(farmerOpen)).toBe(true);
    expect(socketRoomsFor(farmerOpen as never)).toEqual(['alarms:all']);
  });
  it('관리 권한은 열리지 않는다', () => {
    expect(() => requirePlatformAdmin(reqOf(farmerOpen), {} as Response, vi.fn())).toThrow();
    expect(() => requireRoleOrMaster('quarantine_officer')(reqOf(farmerOpen), {} as Response, vi.fn())).toThrow();
  });
  it('소유자는 그대로 마스터', () => {
    expect(tokenScopeFor(OWNER_EMAILS[0], [])).toMatchObject({ isMaster: true });
  });
});
