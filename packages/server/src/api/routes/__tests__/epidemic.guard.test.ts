// SEC-04 회귀 — /epidemic/* 인증·역할·농장 범위
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { signAccessToken } from '../../../lib/auth.js';

const MY = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';

vi.mock('../../../services/auth/approval.service.js', async (orig) => ({
  ...(await orig<typeof import('../../../services/auth/approval.service.js')>()),
  isUserApproved: vi.fn(async () => true),
}));
const scan = vi.fn(async () => ({ clusters: 0 }));
vi.mock('../../../epidemic/epidemic-scheduler.js', () => ({ runEpidemicScan: () => scan() }));
const ack = vi.fn(async () => undefined);
vi.mock('../../../epidemic/cluster-repository.js', () => ({
  getActiveClusters: async () => [{ clusterId: 'c1', diseaseType: 'x', centerLat: 37, centerLng: 127, radiusKm: 5, level: 'watch', eventCount: 3, spreadRateFarmsPerDay: 0, spreadRateEventsPerDay: 0, spreadTrend: 'stable', firstDetectedAt: new Date(), lastUpdatedAt: new Date() }],
  getClusterFarms: async () => [
    { farmId: MY, farmName: '내 목장', lat: 37, lng: 127, eventCount: 1, latestEventAt: new Date() },
    { farmId: OTHER, farmName: '남의 목장', lat: 37.01, lng: 127.01, eventCount: 2, latestEventAt: new Date() },
  ],
  getActiveWarnings: async () => [],
  acknowledgeWarning: (...a: unknown[]) => ack(...a),
  getDailySnapshots: async () => [],
}));
vi.mock('../../../config/database.js', () => ({ getDb: () => ({}) }));

const { epidemicRouter, filterFarmsToScope, resetEpidemicScanGuardForTest } = await import('../epidemic.routes.js');
const { errorHandler } = await import('../../middleware/error.js');

function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use('/epidemic', epidemicRouter);
  a.use(errorHandler);
  return a;
}
const tok = (role: 'farmer' | 'veterinarian' | 'quarantine_officer' | 'government_admin', farmIds: string[] = []): string =>
  `Bearer ${signAccessToken({ userId: `u-${role}`, role, farmIds })}`;

beforeEach(() => { scan.mockClear(); ack.mockClear(); resetEpidemicScanGuardForTest(); });

describe('SEC-04 /epidemic', () => {
  it('비로그인은 401 (예전: 전 농장 이름·좌표 공개)', async () => {
    for (const path of ['/epidemic/clusters', '/epidemic/risk-map', '/epidemic/warnings', '/epidemic/dashboard']) {
      expect((await request(app()).get(path)).status).toBe(401);
    }
    expect((await request(app()).post('/epidemic/scan')).status).toBe(401);
  });

  it('농장주는 클러스터의 자기 목장만 보인다', async () => {
    const res = await request(app()).get('/epidemic/clusters').set('Authorization', tok('farmer', [MY]));
    expect(res.status).toBe(200);
    const farms = (res.body.data[0].farms as Array<{ farmId: string }>).map((f) => f.farmId);
    expect(farms).toEqual([MY]);
  });

  it('방역관(무배정)은 전체를 본다', async () => {
    const res = await request(app()).get('/epidemic/clusters').set('Authorization', tok('quarantine_officer'));
    expect(res.body.data[0].farms).toHaveLength(2);
  });

  it('농장주가 남의 농장 주변 분석을 요청하면 403', async () => {
    const res = await request(app()).get(`/epidemic/nearby/${OTHER}`).set('Authorization', tok('farmer', [MY]));
    expect(res.status).toBe(403);
  });

  it('농장주는 전국 스캔·경보 확인 불가', async () => {
    expect((await request(app()).post('/epidemic/scan').set('Authorization', tok('farmer', [MY]))).status).toBe(403);
    expect((await request(app()).post('/epidemic/acknowledge/w1').set('Authorization', tok('farmer', [MY]))).status).toBe(403);
    expect(scan).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
  });

  it('방역관 스캔은 1회 실행, 연속 요청은 429', async () => {
    const t = tok('quarantine_officer');
    expect((await request(app()).post('/epidemic/scan').set('Authorization', t)).status).toBe(200);
    expect((await request(app()).post('/epidemic/scan').set('Authorization', t)).status).toBe(429);
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('경보 확인자는 실제 사용자 id 로 기록된다 (예전: 항상 system)', async () => {
    await request(app()).post('/epidemic/acknowledge/w1').set('Authorization', tok('veterinarian', [MY]));
    expect(ack).toHaveBeenCalledWith(expect.anything(), 'w1', 'u-veterinarian');
  });

  it('filterFarmsToScope', () => {
    expect(filterFarmsToScope([{ farmId: 'a' }, { farmId: 'b' }], ['b'])).toEqual([{ farmId: 'b' }]);
    expect(filterFarmsToScope([{ farmId: 'a' }], null)).toEqual([{ farmId: 'a' }]);
  });
});
