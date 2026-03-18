// Auth 유닛 테스트 — JWT + bcrypt + 에러 클래스

import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '@server/lib/auth';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from '@server/lib/errors';
import type { AuthTokenPayload } from '@shared/types/user';

// ===========================================
// Password hashing
// ===========================================

describe('Password hashing', () => {
  it('해시된 비밀번호와 원본이 일치', async () => {
    const plain = 'test-password-123';
    const hash = await hashPassword(plain);

    expect(hash).not.toBe(plain);
    expect(await verifyPassword(plain, hash)).toBe(true);
  });

  it('잘못된 비밀번호는 불일치', async () => {
    const hash = await hashPassword('correct-password');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('같은 비밀번호라도 해시가 다름 (salt)', async () => {
    const hash1 = await hashPassword('same');
    const hash2 = await hashPassword('same');
    expect(hash1).not.toBe(hash2);
  });
});

// ===========================================
// Access Token
// ===========================================

describe('Access Token', () => {
  const payload: AuthTokenPayload = {
    userId: 'test-user-id',
    role: 'farmer',
    farmIds: ['farm-1', 'farm-2'],
  };

  it('서명 후 검증 성공', () => {
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);

    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.role).toBe(payload.role);
    expect(decoded.farmIds).toEqual(payload.farmIds);
  });

  it('잘못된 토큰은 에러', () => {
    expect(() => verifyAccessToken('invalid-token')).toThrow();
  });

  it('토큰은 문자열', () => {
    const token = signAccessToken(payload);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // JWT 형식: header.payload.signature
  });
});

// ===========================================
// Refresh Token
// ===========================================

describe('Refresh Token', () => {
  it('서명 후 검증 성공', () => {
    const token = signRefreshToken({ userId: 'user-123' });
    const decoded = verifyRefreshToken(token);

    expect(decoded.userId).toBe('user-123');
  });

  it('잘못된 토큰은 에러', () => {
    expect(() => verifyRefreshToken('bad-token')).toThrow();
  });
});

// ===========================================
// Error classes
// ===========================================

describe('Error classes', () => {
  it('AppError는 statusCode, code 포함', () => {
    const err = new AppError('test', 418, 'TEAPOT');
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('TEAPOT');
    expect(err.message).toBe('test');
    expect(err.isOperational).toBe(true);
    expect(err).toBeInstanceOf(Error);
  });

  it('BadRequestError → 400', () => {
    const err = new BadRequestError();
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
  });

  it('UnauthorizedError → 401', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
  });

  it('ForbiddenError → 403', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
  });

  it('NotFoundError → 404', () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
  });

  it('ConflictError → 409', () => {
    const err = new ConflictError();
    expect(err.statusCode).toBe(409);
  });

  it('커스텀 메시지 지원', () => {
    const err = new BadRequestError('Invalid input', 'INVALID_INPUT');
    expect(err.message).toBe('Invalid input');
    expect(err.code).toBe('INVALID_INPUT');
  });
});
