// Integration Routes 테스트 — 라우터 등록 + 인증 + 여러 API 통합

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createApiRouter } from '@server/api/index.js';

// Mock all auth
vi.mock('@server/api/middleware/auth.js', () => ({
  authenticate: (_req: any, _res: any, next: any) => {
    _req.user = { userId: 'u-1', role: 'farmer', farmIds: ['f-1'] };
    next();
  },
  optionalAuth: (_req: any, _res: any, next: any) => next(),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('@server/api/middleware/rbac.js', async (orig) => ({
  // 라우터 등록만 보는 테스트 — 실제 모듈의 나머지 export(scopedFarmIds, requirePlatformAdmin 등)는 그대로 둔다
  ...(await orig<Record<string, unknown>>()),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  requireFarmAccess: (_req: any, _res: any, next: any) => next(),
  enforceFarmScope: (_req: any, _res: any, next: any) => next(),
  requirePlatformAdmin: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('@server/api/middleware/validate.js', () => ({
  validate: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock dashboard service
vi.mock('@server/serving/dashboard.service.js', () => ({
  getFarmerDashboard: vi.fn().mockResolvedValue({ kpis: [] }),
  getVetDashboard: vi.fn().mockResolvedValue({ kpis: [] }),
  getInseminatorDashboard: vi.fn().mockResolvedValue({ kpis: [] }),
  getAdminDashboard: vi.fn().mockResolvedValue({ kpis: [] }),
  getQuarantineDashboard: vi.fn().mockResolvedValue({ kpis: [] }),
  getFeedCompanyDashboard: vi.fn().mockResolvedValue({ kpis: [] }),
}));

// Mock chat service
vi.mock('@server/chat/chat-service.js', () => ({
  handleChatMessage: vi.fn().mockResolvedValue({ reply: 'test', context: {} }),
}));

const { errorHandler } = await import('@server/api/middleware/error.js');

const app = express();
app.use(express.json());
app.use('/api', createApiRouter());
app.use(errorHandler); // 실제 app.ts 와 같은 구성 — 없으면 모든 오류가 Express 기본 500 으로 보인다

beforeEach(() => { vi.clearAllMocks(); });

describe('Integration — Router Registration', () => {
  it('모든 새 라우트가 /api 하위에 등록됨 (잘못된 ID 도 5xx 가 아님)', async () => {
    // Routes that don't hit DB with UUID params should return 200
    const safeRoutes = [
      '/api/search?q=test',
      '/api/prescriptions/drugs',
      '/api/events/types',
      '/api/escalation/unacknowledged',
      '/api/breeding/semen',
    ];

    for (const route of safeRoutes) {
      const res = await request(app).get(route);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }

    // 형식이 잘못된 ID — 예전엔 DB 형식 오류가 500 으로 새어 나왔다. 이제 접근 검사가 400/403/404 로 처리한다
    const dbRoutes = [
      '/api/vaccines/schedule/f-1',
      '/api/economics/f-1',
      '/api/calving/upcoming/f-1',
      '/api/notifications/preferences',
      '/api/lactation/a-1',
    ];

    for (const route of dbRoutes) {
      const res = await request(app).get(route);
      expect(res.status).toBeLessThan(500);
    }
  });

  it('POST 엔드포인트 — non-UUID farmId 는 404 (SEC-09 스코프 검사)', async () => {
    const res = await request(app)
      .post('/api/events')
      .send({ farmId: 'f-1', eventType: 'health', description: 'test' });
    expect(res.status).toBe(404);
  });

  it('기존 라우트 보존 — /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('기존 라우트 보존 — /api/dashboard', async () => {
    const res = await request(app).get('/api/dashboard?farmId=f-1');
    expect(res.status).toBe(200);
  });

  it('존재하지 않는 라우트 — 404', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
  });

  it('에스컬레이션 acknowledge POST — non-existent alert returns 404', async () => {
    const res = await request(app)
      .post('/api/escalation/acknowledge/alert-1')
      .send({});
    // 알림 접근 검사가 없는 알림을 '찾을 수 없음'으로 처리 (예전: DB 오류 500)
    expect(res.status).toBe(404);
  });

  it('알림 설정 POST — non-UUID userId 는 400 (형식 오류는 서버 장애가 아니다)', async () => {
    const res = await request(app)
      .post('/api/notifications/preferences')
      .send({ channels: [] });
    // 테스트 사용자 id 'u-1' 이 UUID 가 아니어서 DB 형식 오류(22P02) → 전역 처리기가 400 으로 응답
    expect(res.status).toBe(400);
  });
});
