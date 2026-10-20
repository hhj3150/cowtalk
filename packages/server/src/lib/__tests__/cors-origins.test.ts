// SEC-19 회귀 — CORS 정규식이 시작 고정 없이 evilcowtalk.kr·모든 Netlify 사이트를 허용하던 문제
import { describe, it, expect } from 'vitest';
import { allowedOrigins, isAllowedOrigin } from '../cors-origins.js';

const prod = allowedOrigins('production', undefined);

describe('SEC-19 allowedOrigins', () => {
  it.each([
    'https://cowtalk.netlify.app',
    'https://deploy-preview-32--cowtalk.netlify.app',
    'https://cowtalk.kr',
    'https://www.cowtalk.kr',
  ])('허용: %s', (o) => { expect(isAllowedOrigin(o, prod)).toBe(true); });

  it.each([
    'https://evilcowtalk.kr',
    'https://cowtalk.kr.evil.com',
    'https://attacker.netlify.app',
    'https://evil-cowtalk.netlify.app',
    'http://cowtalk.kr',
    'https://cowtalk.netlify.app.evil.com',
  ])('거부: %s', (o) => { expect(isAllowedOrigin(o, prod)).toBe(false); });

  it('추가 출처는 정확히 일치만', () => {
    const a = allowedOrigins('production', 'https://staging.example.com, not a url');
    expect(isAllowedOrigin('https://staging.example.com', a)).toBe(true);
    expect(isAllowedOrigin('https://staging.example.com.evil', a)).toBe(false);
  });
});
