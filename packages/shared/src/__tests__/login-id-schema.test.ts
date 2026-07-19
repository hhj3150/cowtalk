// 로그인 식별자 스키마 테스트 — 이메일 + 일반 아이디 병행 허용

import { describe, it, expect } from 'vitest';
import { loginIdSchema, loginSchema, registerSchema } from '../schemas/api.js';

describe('loginIdSchema', () => {
  it('이메일을 허용한다', () => {
    expect(loginIdSchema.safeParse('user@example.com').success).toBe(true);
  });

  it('일반 아이디(영문/숫자/._- 3~50자)를 허용한다', () => {
    expect(loginIdSchema.safeParse('hhj3150').success).toBe(true);
    expect(loginIdSchema.safeParse('farm_user.01').success).toBe(true);
  });

  it('너무 짧거나 특수문자·공백·한글은 거부한다', () => {
    expect(loginIdSchema.safeParse('ab').success).toBe(false);
    expect(loginIdSchema.safeParse('한글아이디').success).toBe(false);
    expect(loginIdSchema.safeParse('id with space').success).toBe(false);
    expect(loginIdSchema.safeParse('id;drop').success).toBe(false);
  });

  it('loginSchema·registerSchema 모두 일반 아이디로 통과한다', () => {
    expect(loginSchema.safeParse({ email: 'hhj3150', password: 'hhjsyswc123**' }).success).toBe(true);
    expect(
      registerSchema.safeParse({ name: '송영신 목장주', email: 'hhj3150', password: 'longenough1**', role: 'farmer' }).success,
    ).toBe(true);
  });
});
