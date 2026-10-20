// AI-08 회귀 — AI 출력에 모델·프롬프트·입력 출처가 없어 재현·감사가 불가능하던 문제
import { describe, it, expect } from 'vitest';
import { inputHash, sha256Hex } from '../provenance.js';

describe('AI-08 provenance', () => {
  it('키 순서가 달라도 같은 입력이면 같은 지문', () => {
    expect(inputHash({ a: 1, b: { y: 2, x: [1, null] } })).toBe(inputHash({ b: { x: [1, null], y: 2 }, a: 1 }));
  });
  it('값이 다르면 다른 지문, null 과 0 은 구분', () => {
    expect(inputHash({ temp: null })).not.toBe(inputHash({ temp: 0 }));
  });
  it('sha256 hex 64자', () => {
    expect(sha256Hex('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});
