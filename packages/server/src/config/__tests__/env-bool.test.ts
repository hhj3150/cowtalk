// OPS-08 회귀 — REDIS_ENABLED=false·KAKAO_ALIMTALK_TEST_MODE=false 가 true 로 읽히던 문제
import { describe, it, expect } from 'vitest';
import { envBool } from '../index.js';

describe('OPS-08 envBool', () => {
  it.each([['false', false], ['FALSE', false], ['0', false], ['off', false], ['true', true], ['1', true], [' Yes ', true]])(
    '%s → %s', (v, want) => {
      expect(envBool(true).parse(v)).toBe(want);
      expect(envBool(false).parse(v)).toBe(want);
    },
  );
  it('미설정·알 수 없는 값은 기본값', () => {
    expect(envBool(true).parse(undefined)).toBe(true);
    expect(envBool(false).parse(undefined)).toBe(false);
    expect(envBool(true).parse('maybe')).toBe(true);
  });
});
