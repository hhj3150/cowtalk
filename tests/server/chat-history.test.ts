// GET /chat/history — 서버측 대화 이력 (기기·세션을 넘는 장기 기억)

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const ME = '22222222-aaaa-4bbb-8ccc-000000000001';
const STRANGER = '22222222-aaaa-4bbb-8ccc-000000000002';

const mockUser = { userId: ME, role: 'farmer' };

vi.mock('@server/api/middleware/auth.js', () => ({
  authenticate: (_req: any, _res: any, next: any) => {
    _req.user = { ...mockUser };
    next();
  },
}));

import { chatRouter } from '@server/api/routes/chat.routes.js';
import { getDb, closeDb } from '@server/config/database.js';
import { regions, farms, users, chatConversations } from '@server/db/schema.js';
import { eq, inArray } from 'drizzle-orm';

const app = express();
app.use(express.json());
app.use('/chat', chatRouter);

let regionId: string;
let farmId: string;

beforeAll(async () => {
  const db = getDb();
  const [region] = await db.insert(regions).values({
    province: '테스트도', district: '이력군', code: `H${String(Date.now()).slice(-8)}`,
  }).returning();
  regionId = region!.regionId;
  const [farm] = await db.insert(farms).values({
    regionId, name: '이력테스트목장', address: '주소', lat: 37, lng: 127,
  }).returning();
  farmId = farm!.farmId;

  await db.insert(users).values([
    { userId: ME, name: '이력사용자', email: `hist-me-${Date.now()}@test.local`, passwordHash: 'x', role: 'farmer' },
    { userId: STRANGER, name: '타인', email: `hist-other-${Date.now()}@test.local`, passwordHash: 'x', role: 'farmer' },
  ]);

  const base = Date.now();
  await db.insert(chatConversations).values([
    {
      userId: ME, role: 'farmer', farmId, question: '첫 질문', answer: '첫 답변',
      contextType: 'farm', createdAt: new Date(base - 2000),
    },
    {
      userId: ME, role: 'farmer', farmId: null, question: '둘째 질문', answer: '둘째 답변',
      contextType: 'general', createdAt: new Date(base - 1000),
    },
    {
      userId: STRANGER, role: 'farmer', farmId, question: '남의 질문', answer: '남의 답변',
      contextType: 'farm', createdAt: new Date(base - 500),
    },
  ]);
});

afterAll(async () => {
  const db = getDb();
  await db.delete(chatConversations).where(inArray(chatConversations.userId, [ME, STRANGER]));
  await db.delete(users).where(inArray(users.userId, [ME, STRANGER]));
  await db.delete(farms).where(eq(farms.farmId, farmId));
  await db.delete(regions).where(eq(regions.regionId, regionId));
  await closeDb();
});

describe('GET /chat/history', () => {
  it('본인 대화만, 시간 오름차순으로 반환', async () => {
    mockUser.userId = ME;
    const res = await request(app).get('/chat/history');
    expect(res.status).toBe(200);
    const questions = (res.body.data as Array<{ question: string }>).map((r) => r.question);
    expect(questions).toContain('첫 질문');
    expect(questions).toContain('둘째 질문');
    expect(questions).not.toContain('남의 질문');
    expect(questions.indexOf('첫 질문')).toBeLessThan(questions.indexOf('둘째 질문'));
  });

  it('farmId 필터', async () => {
    mockUser.userId = ME;
    const res = await request(app).get(`/chat/history?farmId=${farmId}`);
    expect(res.status).toBe(200);
    const questions = (res.body.data as Array<{ question: string }>).map((r) => r.question);
    expect(questions).toContain('첫 질문');
    expect(questions).not.toContain('둘째 질문');
  });

  it('대화 없는 사용자 — 빈 배열', async () => {
    mockUser.userId = '22222222-aaaa-4bbb-8ccc-999999999999';
    const res = await request(app).get('/chat/history');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
