// SEC-18 회귀 — 운영에서 공개 기본 시크릿으로 기동되고, 토큰 알고리즘을 고정하지 않던 문제
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { config, jwtSecretProblems, DEV_JWT_ACCESS_SECRET, DEV_JWT_REFRESH_SECRET } from '../../config/index.js';
import { signAccessToken, verifyAccessToken } from '../auth.js';

describe('SEC-18 jwtSecretProblems', () => {
  it('운영에서 기본 시크릿이면 문제', () => {
    expect(jwtSecretProblems({ NODE_ENV: 'production', JWT_ACCESS_SECRET: DEV_JWT_ACCESS_SECRET, JWT_REFRESH_SECRET: 'r'.repeat(40) })).toHaveLength(1);
    expect(jwtSecretProblems({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: DEV_JWT_REFRESH_SECRET })).toHaveLength(1);
    expect(jwtSecretProblems({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'r'.repeat(40) })).toEqual([]);
  });
  it('개발·테스트에서는 기본값 허용', () => {
    expect(jwtSecretProblems({ NODE_ENV: 'development', JWT_ACCESS_SECRET: DEV_JWT_ACCESS_SECRET, JWT_REFRESH_SECRET: DEV_JWT_REFRESH_SECRET })).toEqual([]);
  });
});

describe('SEC-18 알고리즘 고정', () => {
  const payload = { userId: 'u1', role: 'farmer', farmIds: [] };
  it('HS256 토큰은 통과', () => {
    expect(verifyAccessToken(signAccessToken(payload as never)).userId).toBe('u1');
  });
  it('같은 시크릿이라도 다른 알고리즘(HS512)·서명 없음(none)은 거부', () => {
    const hs512 = jwt.sign(payload, config.JWT_ACCESS_SECRET, { algorithm: 'HS512' });
    expect(() => verifyAccessToken(hs512)).toThrow();
    const none = jwt.sign(payload, '', { algorithm: 'none' } as jwt.SignOptions);
    expect(() => verifyAccessToken(none)).toThrow();
  });
});

describe('SEC-18 .env.example 예시값도 공개값', () => {
  it('예시값·빈 값은 운영에서 거부', () => {
    expect(jwtSecretProblems({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'change-me-access-secret-min-32-chars', JWT_REFRESH_SECRET: '' })).toHaveLength(2);
  });
});
