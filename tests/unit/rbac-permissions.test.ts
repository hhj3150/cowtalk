// RBAC 권한 매트릭스 테스트 — 역할별 리소스 접근 권한
import { describe, it, expect } from 'vitest';
import { hasPermission } from '@shared/constants/roles';
import type { Role } from '@shared/types/user';

describe('hasPermission — 역할별 권한 매트릭스', () => {
  // 농장주
  it('farmer → farm:read 가능', () => {
    expect(hasPermission('farmer' as Role, 'farm', 'read')).toBe(true);
  });

  it('farmer → farm:delete 불가', () => {
    expect(hasPermission('farmer' as Role, 'farm', 'delete')).toBe(false);
  });

  it('farmer → animal:read 가능', () => {
    expect(hasPermission('farmer' as Role, 'animal', 'read')).toBe(true);
  });

  // 수의사
  it('veterinarian → animal:read 가능', () => {
    expect(hasPermission('veterinarian' as Role, 'animal', 'read')).toBe(true);
  });

  it('veterinarian → prediction:read 가능', () => {
    expect(hasPermission('veterinarian' as Role, 'prediction', 'read')).toBe(true);
  });

  // 행정관리
  it('government_admin → farm:read 가능', () => {
    expect(hasPermission('government_admin' as Role, 'farm', 'read')).toBe(true);
  });

  it('government_admin → system:read 가능', () => {
    expect(hasPermission('government_admin' as Role, 'system', 'read')).toBe(true);
  });

  // 수정사
  it('inseminator → animal:create 가능', () => {
    expect(hasPermission('inseminator' as Role, 'animal', 'create')).toBe(true);
  });

  it('inseminator → animal:update 가능', () => {
    expect(hasPermission('inseminator' as Role, 'animal', 'update')).toBe(true);
  });

  it('inseminator → system:write 불가', () => {
    expect(hasPermission('inseminator' as Role, 'system', 'write')).toBe(false);
  });

  // 방역관
  it('quarantine_officer → alert:read 가능', () => {
    expect(hasPermission('quarantine_officer' as Role, 'alert', 'read')).toBe(true);
  });

  // 사료회사
  it('feed_company → sensor:read 가능', () => {
    expect(hasPermission('feed_company' as Role, 'sensor', 'read')).toBe(true);
  });

  it('feed_company → user:write 불가', () => {
    expect(hasPermission('feed_company' as Role, 'user', 'write')).toBe(false);
  });
});
