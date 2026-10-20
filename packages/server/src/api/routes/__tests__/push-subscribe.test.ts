// OPS-12 회귀 — 푸시 구독이 메모리에만 있고, 농장 미배정 계정이 '전체 구독'으로 모든 농장 알림을 받던 문제
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { signAccessToken } from '../../../lib/auth.js';

const addSubscription = vi.fn(async () => undefined);
const removeSubscription = vi.fn(async () => true);
vi.mock('../../../realtime/push-service.js', () => ({
  addSubscription, removeSubscription, sendPushToFarm: vi.fn(async () => 0), getSubscriptionCount: vi.fn(async () => 1),
}));
vi.mock('../../../services/auth/approval.service.js', async (orig) => ({
  ...(await orig<typeof import('../../../services/auth/approval.service.js')>()),
  isUserApproved: vi.fn(async () => true),
}));
vi.mock('../../../config/database.js', () => ({ getDb: () => ({}) }));

const { notificationRouter } = await import('../notification.routes.js');
const { errorHandler } = await import('../../middleware/error.js');
function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use('/notifications', notificationRouter);
  a.use(errorHandler);
  return a;
}
const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };
const bearer = (role: string, farmIds: string[]) => `Bearer ${signAccessToken({ userId: 'u1', role, farmIds } as never)}`;

beforeEach(() => { addSubscription.mockClear(); removeSubscription.mockClear(); });

describe('OPS-12 POST /notifications/subscribe', () => {
  it('농장 미배정 농장주는 전 농장 구독이 아니다', async () => {
    const r = await request(app()).post('/notifications/subscribe').set('Authorization', bearer('farmer', [])).send({ subscription: sub });
    expect(r.status).toBe(200);
    expect(addSubscription).toHaveBeenCalledWith('u1', sub, false, 'high');
  });
  it('배정된 농장주도 발송 시점 배정으로 판정 (allFarms=false)', async () => {
    await request(app()).post('/notifications/subscribe').set('Authorization', bearer('farmer', ['11111111-1111-4111-8111-111111111111'])).send({ subscription: sub, minSeverity: 'critical' });
    expect(addSubscription).toHaveBeenCalledWith('u1', sub, false, 'critical');
  });
  it('농장 제한 없는 계정(행정관)만 전 농장', async () => {
    await request(app()).post('/notifications/subscribe').set('Authorization', bearer('government_admin', [])).send({ subscription: sub });
    expect(addSubscription).toHaveBeenCalledWith('u1', sub, true, 'high');
  });
  it('구독 해제는 본인 것만', async () => {
    await request(app()).post('/notifications/unsubscribe').set('Authorization', bearer('farmer', [])).send({ endpoint: sub.endpoint });
    expect(removeSubscription).toHaveBeenCalledWith(sub.endpoint, 'u1');
  });
});
