// SEC-16 회귀 — 누구나 임의 번호로 유료 알림톡을 보내던 문제
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { signAccessToken } from '../../../lib/auth.js';

const sent: string[] = [];
vi.mock('../../../services/auth/approval.service.js', async (orig) => ({
  ...(await orig<typeof import('../../../services/auth/approval.service.js')>()),
  isUserApproved: vi.fn(async () => true),
}));
vi.mock('../../../lib/kakao-alimtalk.js', () => ({
  sendAlimtalk: vi.fn(async (p: { to: string }) => { sent.push(p.to); return { success: true }; }),
  notifyEstrus: vi.fn(async () => ({ success: true })),
  notifyCalvingImminent: vi.fn(async () => ({ success: true })),
  notifyDiseaseSuspected: vi.fn(async () => ({ success: true })),
}));
vi.mock('../../../config/database.js', () => ({
  getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ phone: '010-1111-2222' }] }) }) }) }),
}));

const { notificationRouter, normalizePhone, allowTestSend } = await import('../notification.routes.js');
const { errorHandler } = await import('../../middleware/error.js');
function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use('/notifications', notificationRouter);
  a.use(errorHandler);
  return a;
}
const farmer = (id = 'f1') => `Bearer ${signAccessToken({ userId: id, role: 'farmer', farmIds: ['11111111-1111-4111-8111-111111111111'] })}`;

beforeEach(() => { sent.length = 0; });

describe('SEC-16 알림톡', () => {
  it('남의 번호로 테스트 발송 403', async () => {
    const r = await request(app()).post('/notifications/alimtalk/test').set('Authorization', farmer()).send({ phone: '010-9999-0000', templateId: 'MORNING_BRIEFING' });
    expect(r.status).toBe(403);
    expect(sent).toHaveLength(0);
  });
  it('내 번호는 허용 (형식 달라도 같은 번호)', async () => {
    const r = await request(app()).post('/notifications/alimtalk/test').set('Authorization', farmer('f2')).send({ phone: '01011112222', templateId: 'MORNING_BRIEFING' });
    expect(r.status).toBe(200);
    expect(sent).toEqual(['01011112222']);
  });
  it('업무 알림 직접 발송은 플랫폼 관리자만', async () => {
    expect((await request(app()).post('/notifications/alimtalk/estrus').set('Authorization', farmer()).send({ phone: '1', farmName: 'a', earTag: '1' })).status).toBe(403);
  });
  it('사용자당 시간당 5건', () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) expect(allowTestSend('u-rate', now)).toBe(true);
    expect(allowTestSend('u-rate', now)).toBe(false);
    expect(allowTestSend('u-rate', now + 3_600_001)).toBe(true);
  });
  it('normalizePhone', () => { expect(normalizePhone('010-1234 5678')).toBe('01012345678'); });
});
