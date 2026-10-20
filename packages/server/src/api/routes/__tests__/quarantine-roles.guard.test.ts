// SEC-12 회귀 — 역학조사·KAHIS 보고·방역 조치를 목장주도 조회·수정하던 문제
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { signAccessToken } from '../../../lib/auth.js';

const MY = '11111111-1111-4111-8111-111111111111';
vi.mock('../../../services/auth/approval.service.js', async (orig) => ({
  ...(await orig<typeof import('../../../services/auth/approval.service.js')>()),
  isUserApproved: vi.fn(async () => true),
}));
vi.mock('../../../config/database.js', () => ({ getDb: () => ({}) }));
vi.mock('../../../services/epidemiology/national-situation.service.js', () => ({
  getNationalSituation: async () => ({}), getProvinceDetail: async () => [], getFarmIdsByProvince: async () => [],
  getProvinceFarms: async () => [{ farmId: MY, farmName: '내 목장' }, { farmId: 'other', farmName: '남의 목장' }],
  getAllMapFarms: async () => [{ farmId: MY, farmName: '내 목장', lat: 37.123, lng: 127.456 }, { farmId: 'other', farmName: '남의 목장', lat: 37.123, lng: 127.456 }],
}));
vi.mock('../../../services/epidemiology/quarantine-dashboard.service.js', () => ({
  getQuarantineDashboard: async () => ({}), getActionQueue: async () => [], getVaccinationStatus: async () => ({}),
}));

const { investigationRouter } = await import('../investigation.routes.js');
const { kahisReportRouter } = await import('../kahis-report.routes.js');
const { quarantineDashboardRouter, maskMapFarmsForScope } = await import('../quarantine-dashboard.routes.js');
const { errorHandler } = await import('../../middleware/error.js');

function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use('/investigation', investigationRouter);
  a.use('/kahis-report', kahisReportRouter);
  a.use('/quarantine', quarantineDashboardRouter);
  a.use(errorHandler);
  return a;
}
const farmer = `Bearer ${signAccessToken({ userId: 'f', role: 'farmer', farmIds: [MY] })}`;
const vet = `Bearer ${signAccessToken({ userId: 'v', role: 'veterinarian', farmIds: [MY] })}`;

describe('SEC-12', () => {
  it('목장주는 역학조사·KAHIS 보고 조회·수정 403', async () => {
    expect((await request(app()).get('/investigation/list').set('Authorization', farmer)).status).toBe(403);
    expect((await request(app()).patch('/kahis-report/x').set('Authorization', farmer).send({ status: 'kahis_submitted' })).status).toBe(403);
    expect((await request(app()).post('/kahis-report').set('Authorization', vet).send({})).status).toBe(403);
  });
  it('목장주는 방역 조치 상태 변경·사례 DB·조치 큐 403', async () => {
    expect((await request(app()).patch('/quarantine/action/1').set('Authorization', farmer).send({ status: 'done' })).status).toBe(403);
    expect((await request(app()).get('/quarantine/cases').set('Authorization', farmer)).status).toBe(403);
    expect((await request(app()).get('/quarantine/action-queue').set('Authorization', farmer)).status).toBe(403);
  });
  it('전국 지도·시도 드릴다운은 유지하되 다른 농장 이름은 가린다', async () => {
    const map = await request(app()).get('/quarantine/map-farms').set('Authorization', farmer);
    expect(map.status).toBe(200);
    const names = (map.body.data as Array<{ farmName: string }>).map((f) => f.farmName);
    expect(names).toEqual(['내 목장', '다른 농장']);
    const prov = await request(app()).get('/quarantine/province-farms/경기').set('Authorization', farmer);
    expect((prov.body.data as Array<{ farmId: string }>).map((f) => f.farmId)).toEqual([MY]);
  });
  it('maskMapFarmsForScope: 좌표는 약 5km 격자로', () => {
    const [m] = maskMapFarmsForScope([{ farmId: 'x', farmName: 'A', lat: 37.123, lng: 127.456 }], []);
    expect(m!.farmName).toBe('다른 농장');
    expect(m!.lat).toBeCloseTo(37.1, 5);
    expect(m!.lng).toBeCloseTo(127.45, 5);
  });
});
