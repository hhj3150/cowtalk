// SEC-02 회귀 — smaXtec 디버그 API(/smaxtec-notes/*) 접근 통제
//
// 재현하던 위험: 인증 없이 GET /api/smaxtec-notes/todos?orgId=... 를 부르면
// 서버의 smaXtec 계정 권한으로 임의 목장의 할일·이벤트·노트 원본이 내려갔다.

import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { config } from '../../../config/index.js';
import { signAccessToken } from '../../../lib/auth.js';

const getTodos = vi.fn(async () => [{ todo: 'stub' }]);
vi.mock('../../../pipeline/connectors/smaxtec.connector.js', () => ({
  SmaxtecApiClient: class {
    getTodos = getTodos;
    getPublicEvents = vi.fn(async () => []);
    getIntegrationEvents = vi.fn(async () => []);
    getNote = vi.fn(async () => ({}));
  },
}));
vi.mock('../../../services/auth/approval.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/auth/approval.service.js')>();
  return { ...actual, isUserApproved: vi.fn(async () => true) };
});

const { smaxtecNotesRouter } = await import('../smaxtec-notes.routes.js');
const { errorHandler } = await import('../../middleware/error.js');

function app(): express.Express {
  const a = express();
  a.use('/smaxtec-notes', smaxtecNotesRouter);
  a.use(errorHandler);
  return a;
}

type MutableConfig = { NODE_ENV: 'development' | 'production' | 'test'; SMAXTEC_API_KEY?: string };
const original = { env: config.NODE_ENV, key: config.SMAXTEC_API_KEY };
afterEach(() => {
  (config as MutableConfig).NODE_ENV = original.env;
  (config as MutableConfig).SMAXTEC_API_KEY = original.key;
  getTodos.mockClear();
});
function dev(): void {
  (config as MutableConfig).NODE_ENV = 'development';
  (config as MutableConfig).SMAXTEC_API_KEY = 'stub-key';
}

const bearer = (p: Parameters<typeof signAccessToken>[0]): string => `Bearer ${signAccessToken(p)}`;
const FARM = '11111111-1111-4111-8111-111111111111';

describe('SEC-02 /smaxtec-notes 접근 통제', () => {
  it('production 에서는 마스터 토큰이어도 404 (엔드포인트 비노출)', async () => {
    (config as MutableConfig).NODE_ENV = 'production';
    const res = await request(app()).get('/smaxtec-notes/todos')
      .set('Authorization', bearer({ userId: 'owner', role: 'government_admin', farmIds: [], isMaster: true }));
    expect(res.status).toBe(404);
    expect(getTodos).not.toHaveBeenCalled();
  });

  it('test 환경에서도 404', async () => {
    const res = await request(app()).get('/smaxtec-notes/debug');
    expect(res.status).toBe(404);
  });

  it('개발 환경 — 비로그인 401', async () => {
    dev();
    const res = await request(app()).get('/smaxtec-notes/todos?orgId=other-org');
    expect(res.status).toBe(401);
    expect(getTodos).not.toHaveBeenCalled();
  });

  it.each([
    ['farmer', { userId: 'u1', role: 'farmer' as const, farmIds: [FARM] }],
    ['veterinarian', { userId: 'u2', role: 'veterinarian' as const, farmIds: [FARM] }],
    ['미배정 행정관(마스터 아님)', { userId: 'u3', role: 'government_admin' as const, farmIds: [] }],
  ])('개발 환경 — %s 403', async (_label, payload) => {
    dev();
    const res = await request(app()).get('/smaxtec-notes/todos').set('Authorization', bearer(payload));
    expect(res.status).toBe(403);
    expect(getTodos).not.toHaveBeenCalled();
  });

  it('개발 환경 — 소유자(마스터) 토큰만 통과', async () => {
    dev();
    const res = await request(app()).get('/smaxtec-notes/todos')
      .set('Authorization', bearer({ userId: 'owner', role: 'government_admin', farmIds: [], isMaster: true }));
    expect(res.status).toBe(200);
    expect(getTodos).toHaveBeenCalledTimes(1);
  });
});
