// SEC-05·06·07 회귀 — 관리자·사용자 API 권한
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { signAccessToken } from '../../../lib/auth.js';
import { hasPermission } from '@cowtalk/shared';

const FARM = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = 'owner-1';

vi.mock('../../../services/auth/approval.service.js', async (orig) => ({
  ...(await orig<typeof import('../../../services/auth/approval.service.js')>()),
  isUserApproved: vi.fn(async () => true),
  isOwnerUserId: vi.fn(async (id: string) => id === OWNER_ID),
}));
vi.mock('../../../db/repositories/user.repo.js', async (orig) => ({
  ...(await orig<typeof import('../../../db/repositories/user.repo.js')>()),
  revokeAllUserRefreshTokens: vi.fn(async () => undefined),
  findUserById: vi.fn(async (id: string) => ({
    userId: id, name: 'x', role: 'government_admin',
    email: id === OWNER_ID ? 'hhj3150@hanmail.net' : 'gg@gov.kr',
  })),
}));
// DB: 어떤 쿼리든 빈 결과 (권한 통과 여부만 관찰)
const chain: Record<string, unknown> = {};
const thenable = Object.assign(Promise.resolve([]), chain);
for (const k of ['select', 'from', 'where', 'orderBy', 'limit', 'innerJoin', 'leftJoin', 'groupBy', 'delete', 'insert', 'values', 'update', 'set', 'returning']) {
  (chain as Record<string, unknown>)[k] = () => thenable;
}
vi.mock('../../../config/database.js', () => ({ getDb: () => chain }));

const { adminRouter } = await import('../admin.routes.js');
const { userRouter } = await import('../user.routes.js');
const { authRouter } = await import('../auth.routes.js');
const { errorHandler } = await import('../../middleware/error.js');

function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use('/admin', adminRouter);
  a.use('/users', userRouter);
  a.use('/auth', authRouter);
  a.use(errorHandler);
  return a;
}
const bearer = (p: Parameters<typeof signAccessToken>[0]): string => `Bearer ${signAccessToken(p)}`;
const farmer = bearer({ userId: 'f1', role: 'farmer', farmIds: [FARM] });
const vet = bearer({ userId: 'v1', role: 'veterinarian', farmIds: [FARM] });
const restrictedAdmin = bearer({ userId: 'ga-restricted', role: 'government_admin', farmIds: [FARM] });
const nationalAdmin = bearer({ userId: 'ga-national', role: 'government_admin', farmIds: [] });
const owner = bearer({ userId: OWNER_ID, role: 'government_admin', farmIds: [], isMaster: true });

describe('SEC-05 /admin/* 는 플랫폼 관리자만', () => {
  it.each([
    ['GET', '/admin/users'], ['GET', '/admin/audit-log'], ['GET', '/admin/system'],
    ['POST', '/admin/run-intelligence'], ['POST', '/admin/sync-breeding'],
  ])('%s %s — 농장주·수의사·배정 행정관 403', async (method, path) => {
    for (const t of [farmer, vet, restrictedAdmin]) {
      const r = method === 'GET' ? request(app()).get(path) : request(app()).post(path);
      expect((await r.set('Authorization', t)).status).toBe(403);
    }
  });

  it('전국 행정관·소유자는 통과 (403 아님)', async () => {
    for (const t of [nationalAdmin, owner]) {
      expect((await request(app()).get('/admin/audit-log').set('Authorization', t)).status).not.toBe(403);
    }
  });
});

describe('SEC-06 사용자 목록·상세', () => {
  it('목장 단위 역할에 user:read 권한이 없다', () => {
    expect(hasPermission('farmer', 'user', 'read')).toBe(false);
    expect(hasPermission('veterinarian', 'user', 'read')).toBe(false);
    expect(hasPermission('government_admin', 'user', 'read')).toBe(true);
  });

  it('농장주·수의사·배정 행정관은 사용자 목록 403', async () => {
    for (const t of [farmer, vet, restrictedAdmin]) {
      expect((await request(app()).get('/users').set('Authorization', t)).status).toBe(403);
    }
  });

  it('본인 상세는 조회 가능, 타인 상세는 403', async () => {
    expect((await request(app()).get('/users/f1').set('Authorization', farmer)).status).not.toBe(403);
    expect((await request(app()).get('/users/v1').set('Authorization', farmer)).status).toBe(403);
  });
});

describe('SEC-07 마스터 토큰·자기 배정', () => {
  it('비소유자 행정관은 역할 전환(마스터 토큰 발급) 403', async () => {
    const r = await request(app()).post('/auth/switch-role').set('Authorization', restrictedAdmin).send({ role: 'farmer' });
    expect(r.status).toBe(403);
    const r2 = await request(app()).post('/auth/switch-role').set('Authorization', nationalAdmin).send({ role: 'farmer' });
    expect(r2.status).toBe(403);
  });

  it('소유자는 역할 전환 가능', async () => {
    const r = await request(app()).post('/auth/switch-role').set('Authorization', owner).send({ role: 'farmer' });
    expect(r.status).toBe(200);
  });

  it('행정관이 자기 목장 배정을 해제할 수 없다', async () => {
    const r = await request(app()).put('/users/ga-national/farms').set('Authorization', nationalAdmin).send({ farmIds: [] });
    expect(r.status).toBe(403);
  });
});
