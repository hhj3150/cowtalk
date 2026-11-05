import { describe, it, expect } from 'vitest';
import { rateLimitIdentity } from '../rate-limit-key.js';

const verify = (t: string): { userId: string } => {
  if (t === 'good') return { userId: 'u1' };
  throw new Error('invalid');
};

describe('rateLimitIdentity — 행사장 공용 IP에서 발표자 보호', () => {
  it('유효 토큰이면 계정 기준', () => {
    expect(rateLimitIdentity({ headers: { authorization: 'Bearer good' }, ip: '1.2.3.4' }, verify)).toEqual({ key: 'user:u1', authenticated: true });
  });
  it('토큰 없거나 위조면 IP 기준', () => {
    expect(rateLimitIdentity({ headers: {}, ip: '1.2.3.4' }, verify)).toEqual({ key: 'ip:1.2.3.4', authenticated: false });
    expect(rateLimitIdentity({ headers: { authorization: 'Bearer bad' }, ip: '1.2.3.4' }, verify).key).toBe('ip:1.2.3.4');
  });
});
