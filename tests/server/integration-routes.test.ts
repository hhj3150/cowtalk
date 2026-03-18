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
}));

vi.mock('@server/api/middleware/rbac.js', () => ({
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  requireFarmAccess: (_req: any, _res: any, next: any) => next(),
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

const app = express();
app.use(express.json());
app.use('/api', createApiRouter());

beforeEach(() => { vi.clearAllMocks(); });

describe('Integration — Router Registration', () => {
  it('모든 새 라우트가 /api 하위에 등록됨', async () => {
    // 새 라우트 모듈 접근 가능 확인
    const routes = [
      '/api/search?q=test',
      '/api/prescriptions/drugs',
      '/api/vaccines/schedule/f-1',
      '/api/events/types',
      '/api/economics/f-1',
      '/api/calving/upcoming/f-1',
      '/api/escalation/unacknowledged',
      '/api/notifications/preferences',
      '/api/lactation/a-1',
      '/api/breeding/semen',
    ];

    for (const route of routes) {
      const res = await request(app).get(route);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }
  });

  it('POST 엔드포인트도 작동', async () => {
    const res = await request(app)
      .post('/api/events')
      .send({ farmId: 'f-1', eventType: 'health', description: 'test' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
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

  it('에스컬레이션 acknowledge POST', async () => {
    const res = await request(app)
      .post('/api/escalation/acknowledge/alert-1')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('acknowledged');
  });

  it('알림 설정 POST', async () => {
    const res = await request(app)
      .post('/api/notifications/preferences')
      .send({ channels: [] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
