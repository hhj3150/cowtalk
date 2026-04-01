// 감사 로그 미들웨어 테스트

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// logger 모킹
vi.mock('../../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// 동적 import로 모킹 후 로드
const { auditLogger } = await import('../audit-logger.js');
const { logger } = await import('../../../lib/logger.js');

function makeReq(path: string, overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path,
    headers: {},
    query: {},
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
    user: undefined,
    ...overrides,
  } as unknown as Request;
}

function makeRes(): { res: Response; onFinish: () => void } {
  let finishCb: (() => void) | null = null;
  const res = {
    statusCode: 200,
    on: (event: string, cb: () => void) => {
      if (event === 'finish') finishCb = cb;
    },
  } as unknown as Response;

  return {
    res,
    onFinish: () => {
      if (finishCb) finishCb();
    },
  };
}

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe('auditLogger 미들웨어', () => {
  const next: NextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('민감하지 않은 경로는 로깅하지 않는다', () => {
    const req = makeReq('/some/other/path');
    const { res, onFinish } = makeRes();

    auditLogger(req, res, next);
    onFinish();

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('/auth/login 경로는 감사 로깅 대상이다', () => {
    const req = makeReq('/auth/login');
    const { res, onFinish } = makeRes();

    auditLogger(req, res, next);
    onFinish();

    expect(logger.info).toHaveBeenCalledOnce();
    const [logObj, msg] = (logger.info as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(logObj.audit).toBe(true);
    expect(logObj.path).toBe('/auth/login');
    expect(typeof msg).toBe('string');
    expect(msg).toContain('[AUDIT]');
  });

  it('/animals 경로는 감사 로깅 대상이다', () => {
    const req = makeReq('/animals');
    const { res, onFinish } = makeRes();

    auditLogger(req, res, next);
    onFinish();

    expect(logger.info).toHaveBeenCalledOnce();
  });

  it('/chat 경로는 감사 로깅 대상이다', () => {
    const req = makeReq('/chat');
    const { res, onFinish } = makeRes();

    auditLogger(req, res, next);
    onFinish();

    expect(logger.info).toHaveBeenCalledOnce();
  });

  it('400+ 응답은 warn 레벨로 로깅한다', () => {
    const req = makeReq('/auth/login');
    const { res, onFinish } = makeRes();
    res.statusCode = 401;

    auditLogger(req, res, next);
    onFinish();

    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('X-Forwarded-For 헤더에서 IP를 추출한다', () => {
    const req = makeReq('/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
    });
    const { res, onFinish } = makeRes();

    auditLogger(req, res, next);
    onFinish();

    const [logObj] = (logger.info as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(logObj.ip).toBe('203.0.113.10');
  });

  it('인증된 사용자 ID를 로그에 포함한다', () => {
    const req = makeReq('/animals', {
      user: { userId: 'user-abc-123', role: 'farmer', farmId: 'farm-1' } as unknown as Request['user'],
    });
    const { res, onFinish } = makeRes();

    auditLogger(req, res, next);
    onFinish();

    const [logObj] = (logger.info as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(logObj.userId).toBe('user-abc-123');
  });

  it('민감하지 않은 경로에서도 next()는 항상 호출된다', () => {
    const req = makeReq('/public/stats');
    const { res } = makeRes();

    auditLogger(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
