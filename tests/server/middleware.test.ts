// 미들웨어 유닛 테스트

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { signAccessToken } from '@server/lib/auth';
import { authenticate, optionalAuth } from '@server/api/middleware/auth';
import { requireRole, requirePermission } from '@server/api/middleware/rbac';
import { validate } from '@server/api/middleware/validate';
import { UnauthorizedError, ForbiddenError } from '@server/lib/errors';
import { z } from 'zod';
import type { AuthTokenPayload } from '@shared/types/user';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  return {} as Response;
}

const next: NextFunction = vi.fn();

// ===========================================
// Auth middleware
// ===========================================

describe('authenticate middleware', () => {
  const payload: AuthTokenPayload = {
    userId: 'u1',
    role: 'farmer',
    farmIds: ['f1'],
  };

  it('유효한 Bearer 토큰 → req.user 설정', () => {
    const token = signAccessToken(payload);
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });

    authenticate(req, mockRes(), next);

    expect(req.user).toBeDefined();
    expect(req.user?.userId).toBe('u1');
    expect(req.user?.role).toBe('farmer');
    expect(next).toHaveBeenCalled();
  });

  it('헤더 없음 → UnauthorizedError', () => {
    const req = mockReq();
    expect(() => authenticate(req, mockRes(), next)).toThrow(UnauthorizedError);
  });

  it('잘못된 토큰 → UnauthorizedError', () => {
    const req = mockReq({ headers: { authorization: 'Bearer invalid' } });
    expect(() => authenticate(req, mockRes(), next)).toThrow(UnauthorizedError);
  });
});

describe('optionalAuth middleware', () => {
  it('토큰 있으면 파싱', () => {
    const token = signAccessToken({ userId: 'u2', role: 'veterinarian', farmIds: [] });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });

    optionalAuth(req, mockRes(), next);
    expect(req.user?.userId).toBe('u2');
  });

  it('토큰 없어도 통과', () => {
    const req = mockReq();
    optionalAuth(req, mockRes(), next);
    expect(req.user).toBeUndefined();
  });
});

// ===========================================
// RBAC middleware
// ===========================================

describe('requireRole middleware', () => {
  it('허용된 역할 → 통과', () => {
    const req = mockReq();
    req.user = { userId: 'u1', role: 'farmer', farmIds: [] };
    const middleware = requireRole('farmer', 'veterinarian');

    middleware(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('미허용 역할 → ForbiddenError', () => {
    const req = mockReq();
    req.user = { userId: 'u1', role: 'quarantine_officer', farmIds: [] };
    const middleware = requireRole('farmer', 'veterinarian');

    expect(() => middleware(req, mockRes(), next)).toThrow(ForbiddenError);
  });

  it('인증 안됨 → UnauthorizedError', () => {
    const req = mockReq();
    const middleware = requireRole('farmer');

    expect(() => middleware(req, mockRes(), next)).toThrow(UnauthorizedError);
  });
});

describe('requirePermission middleware', () => {
  it('farmer가 animal read → 통과', () => {
    const req = mockReq();
    req.user = { userId: 'u1', role: 'farmer', farmIds: [] };
    const middleware = requirePermission('animal', 'read');

    middleware(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('quarantine_officer가 animal delete → ForbiddenError', () => {
    const req = mockReq();
    req.user = { userId: 'u1', role: 'quarantine_officer', farmIds: [] };
    const middleware = requirePermission('animal', 'delete');

    expect(() => middleware(req, mockRes(), next)).toThrow(ForbiddenError);
  });
});

// ===========================================
// Validate middleware
// ===========================================

describe('validate middleware', () => {
  const schema = z.object({
    email: z.string().email(),
    age: z.coerce.number().int().min(0),
  });

  it('유효한 body → 통과 + 파싱값 교체', () => {
    const req = mockReq({ body: { email: 'test@example.com', age: '25' } });
    const middleware = validate({ body: schema });

    middleware(req, mockRes(), next);
    expect(req.body.age).toBe(25); // coerced
    expect(next).toHaveBeenCalled();
  });

  it('잘못된 body → BadRequestError', () => {
    const req = mockReq({ body: { email: 'not-an-email', age: -1 } });
    const middleware = validate({ body: schema });

    expect(() => middleware(req, mockRes(), next)).toThrow();
  });

  it('query 검증', () => {
    const querySchema = z.object({ page: z.coerce.number().default(1) });
    const req = mockReq({ query: { page: '3' } });
    const middleware = validate({ query: querySchema });

    middleware(req, mockRes(), next);
    // Express 5 query는 읽기전용 — validate는 검증만 수행, coerce는 라우트 핸들러 역할
    expect(req.query.page).toBe('3');
  });
});
