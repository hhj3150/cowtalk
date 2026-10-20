// SEC-03 회귀 — PATCH /users/:userId 권한 상승 차단
//
// 재현하던 위험: 행정관(government_admin, user:update 권한) 계정이
//   1) 자기 이름을 '… Master Admin' 으로 바꾸면 소유자로 판정되어 계정 승인 관리 권한을 얻었다
//   2) 자기·타인의 role 을 임의 문자열/상위 역할로 바꿀 수 있었다
//   3) 소유자 계정의 정보를 덮어쓸 수 있었다

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { signAccessToken } from '../../../lib/auth.js';

const OWNER_ID = 'owner-1';
const ADMIN_ID = 'admin-1';
const FARMER_ID = 'farmer-1';
const updates: Array<Record<string, unknown>> = [];

vi.mock('../../../services/auth/approval.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/auth/approval.service.js')>();
  return {
    ...actual,
    isUserApproved: vi.fn(async () => true),
    isOwnerUserId: vi.fn(async (id: string) => id === OWNER_ID),
  };
});
vi.mock('../../../config/database.js', () => ({
  getDb: () => ({
    update: () => ({
      set: (data: Record<string, unknown>) => {
        updates.push(data);
        return { where: () => ({ returning: async () => [{ userId: 'x', ...data }] }) };
      },
    }),
  }),
}));

const { userRouter } = await import('../user.routes.js');
const { errorHandler } = await import('../../middleware/error.js');

function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use('/users', userRouter);
  a.use(errorHandler);
  return a;
}
const asAdmin = `Bearer ${signAccessToken({ userId: ADMIN_ID, role: 'government_admin', farmIds: [] })}`;
const asOwner = `Bearer ${signAccessToken({ userId: OWNER_ID, role: 'government_admin', farmIds: [], isMaster: true })}`;

beforeEach(() => { updates.length = 0; });

describe('SEC-03 PATCH /users/:userId', () => {
  it('행정관이 역할을 바꾸려 하면 403', async () => {
    const res = await request(app()).patch(`/users/${ADMIN_ID}`).set('Authorization', asAdmin).send({ role: 'government_admin' });
    expect(res.status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it('행정관이 타인 상태(차단 등)를 바꾸려 하면 403', async () => {
    const res = await request(app()).patch(`/users/${FARMER_ID}`).set('Authorization', asAdmin).send({ status: 'inactive' });
    expect(res.status).toBe(403);
  });

  it('행정관이 소유자 계정을 수정하려 하면 403', async () => {
    const res = await request(app()).patch(`/users/${OWNER_ID}`).set('Authorization', asAdmin).send({ name: '바꿔치기' });
    expect(res.status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it('행정관은 일반 사용자의 이름·전화번호 수정은 계속 가능 (기존 기능 유지)', async () => {
    const res = await request(app()).patch(`/users/${FARMER_ID}`).set('Authorization', asAdmin).send({ name: '김목장', phone: '010-0000-0000' });
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ name: '김목장' });
  });

  it('소유자도 존재하지 않는 역할은 넣을 수 없다', async () => {
    const res = await request(app()).patch(`/users/${FARMER_ID}`).set('Authorization', asOwner).send({ role: 'super_admin' });
    expect(res.status).toBe(400);
  });

  it('소유자는 역할 변경 가능', async () => {
    const res = await request(app()).patch(`/users/${FARMER_ID}`).set('Authorization', asOwner).send({ role: 'veterinarian' });
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ role: 'veterinarian' });
  });

  it('농장주는 사용자 수정 권한 자체가 없다', async () => {
    const asFarmer = `Bearer ${signAccessToken({ userId: FARMER_ID, role: 'farmer', farmIds: [] })}`;
    const res = await request(app()).patch(`/users/${FARMER_ID}`).set('Authorization', asFarmer).send({ name: '자기수정' });
    expect(res.status).toBe(403);
  });
});
