// GET /notifications/recent — 알림 서랍 실데이터 테스트
// 농장 권한 스코프 + 광역 역할(방역관) 전체 조회 검증

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const FARMER_ID = '11111111-aaaa-4bbb-8ccc-000000000001';
const OTHER_FARMER_ID = '11111111-aaaa-4bbb-8ccc-000000000002';
const OFFICER_ID = '11111111-aaaa-4bbb-8ccc-000000000003';

// 테스트별로 갈아끼우는 인증 사용자
const mockUser = { userId: FARMER_ID, role: 'farmer' };

vi.mock('@server/api/middleware/auth.js', () => ({
  authenticate: (_req: any, _res: any, next: any) => {
    _req.user = { ...mockUser };
    next();
  },
}));

import { notificationRouter } from '@server/api/routes/notification.routes.js';
import { getDb, closeDb } from '@server/config/database.js';
import { regions, farms, users, userFarmAccess, alerts } from '@server/db/schema.js';
import { eq, inArray } from 'drizzle-orm';

const app = express();
app.use(express.json());
app.use('/notifications', notificationRouter);

let regionId: string;
let myFarmId: string;
let otherFarmId: string;

beforeAll(async () => {
  const db = getDb();
  const [region] = await db.insert(regions).values({
    province: '테스트도', district: '테스트군', code: `T${String(Date.now()).slice(-8)}`,
  }).returning();
  regionId = region!.regionId;

  const [myFarm] = await db.insert(farms).values({
    regionId, name: '알림테스트목장', address: '테스트 주소 1', lat: 37, lng: 127,
  }).returning();
  myFarmId = myFarm!.farmId;

  const [otherFarm] = await db.insert(farms).values({
    regionId, name: '남의목장', address: '테스트 주소 2', lat: 36, lng: 127,
  }).returning();
  otherFarmId = otherFarm!.farmId;

  await db.insert(users).values([
    { userId: FARMER_ID, name: '알림농장주', email: `notif-farmer-${Date.now()}@test.local`, passwordHash: 'x', role: 'farmer' },
    { userId: OTHER_FARMER_ID, name: '무권한농장주', email: `notif-other-${Date.now()}@test.local`, passwordHash: 'x', role: 'farmer' },
    { userId: OFFICER_ID, name: '방역관', email: `notif-officer-${Date.now()}@test.local`, passwordHash: 'x', role: 'quarantine_officer' },
  ]);
  await db.insert(userFarmAccess).values({ userId: FARMER_ID, farmId: myFarmId, permissionLevel: 'read' });

  await db.insert(alerts).values([
    {
      alertType: 'health_risk', farmId: myFarmId, priority: 'high', status: 'new',
      title: '내 농장 알림', explanation: '체온 이상 감지', recommendedAction: '',
      dedupKey: `test-mine-${Date.now()}`,
    },
    {
      alertType: 'health_risk', farmId: otherFarmId, priority: 'high', status: 'new',
      title: '남의 농장 알림', explanation: '체온 이상 감지', recommendedAction: '',
      dedupKey: `test-other-${Date.now()}`,
    },
  ]);
});

afterAll(async () => {
  const db = getDb();
  await db.delete(alerts).where(inArray(alerts.farmId, [myFarmId, otherFarmId]));
  await db.delete(userFarmAccess).where(eq(userFarmAccess.userId, FARMER_ID));
  await db.delete(users).where(inArray(users.userId, [FARMER_ID, OTHER_FARMER_ID, OFFICER_ID]));
  await db.delete(farms).where(inArray(farms.farmId, [myFarmId, otherFarmId]));
  await db.delete(regions).where(eq(regions.regionId, regionId));
  await closeDb();
});

describe('GET /notifications/recent', () => {
  it('농장주 — 자기 농장 알림만 보인다', async () => {
    mockUser.userId = FARMER_ID;
    mockUser.role = 'farmer';
    const res = await request(app).get('/notifications/recent');
    expect(res.status).toBe(200);
    const titles = (res.body.data as Array<{ title: string }>).map((n) => n.title);
    expect(titles).toContain('내 농장 알림');
    expect(titles).not.toContain('남의 농장 알림');
  });

  it('농장 권한 없는 농장주 — 빈 목록 (데이터 유출 없음)', async () => {
    mockUser.userId = OTHER_FARMER_ID;
    mockUser.role = 'farmer';
    const res = await request(app).get('/notifications/recent');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('방역관 — 전체 농장 알림 조회', async () => {
    mockUser.userId = OFFICER_ID;
    mockUser.role = 'quarantine_officer';
    const res = await request(app).get('/notifications/recent?limit=100');
    expect(res.status).toBe(200);
    const titles = (res.body.data as Array<{ title: string }>).map((n) => n.title);
    expect(titles).toContain('내 농장 알림');
    expect(titles).toContain('남의 농장 알림');
  });

  it('read 필드 — status=new는 미읽음', async () => {
    mockUser.userId = FARMER_ID;
    mockUser.role = 'farmer';
    const res = await request(app).get('/notifications/recent');
    const mine = (res.body.data as Array<{ title: string; read: boolean }>).find((n) => n.title === '내 농장 알림');
    expect(mine?.read).toBe(false);
  });
});
