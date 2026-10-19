// 환경변수 불리언 파싱 — 스위치가 반대로 붙는 사고를 막는 회귀 테스트.
// 배경: z.coerce.boolean() 은 Boolean("false") === true 라서
// EMAIL_TEST_MODE=false 가 "테스트 모드 ON"이 되고, SMTP_SECURE=false 가 TLS 강제가 됐다.
// (종단 테스트에서 메일 발송이 전부 ESOCKET 으로 실패해 발견)

import { describe, it, expect } from 'vitest';
import { parseBoolEnv } from '../env-bool.js';

describe('parseBoolEnv', () => {
  it('문자열 "false" 는 false 다 (이 한 줄이 이 파일의 존재 이유)', () => {
    expect(parseBoolEnv('false', true)).toBe(false);
    expect(parseBoolEnv('FALSE', true)).toBe(false);
    expect(parseBoolEnv(' False ', true)).toBe(false);
  });

  it('흔한 참/거짓 표기를 모두 받는다', () => {
    for (const v of ['1', 'true', 'yes', 'y', 'on', 'TRUE']) expect(parseBoolEnv(v, false)).toBe(true);
    for (const v of ['0', 'false', 'no', 'n', 'off', 'OFF']) expect(parseBoolEnv(v, true)).toBe(false);
  });

  it('미설정·빈 문자열은 기본값', () => {
    expect(parseBoolEnv(undefined, true)).toBe(true);
    expect(parseBoolEnv(undefined, false)).toBe(false);
    expect(parseBoolEnv('', true)).toBe(true);
    expect(parseBoolEnv(null, false)).toBe(false);
  });

  it('알 수 없는 값은 기본값으로 떨어진다 (오타로 스위치가 반대로 붙지 않게)', () => {
    expect(parseBoolEnv('ture', false)).toBe(false);
    expect(parseBoolEnv('아니오', true)).toBe(true);
  });

  it('이미 boolean 이면 그대로', () => {
    expect(parseBoolEnv(true, false)).toBe(true);
    expect(parseBoolEnv(false, true)).toBe(false);
  });
});
