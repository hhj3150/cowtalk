// CLOVA 어댑터의 순수 변환 로직만 테스트한다 (키가 없어 실 호출은 못 한다).
// 배속 매핑을 틀리면 음성이 반대로 빨라지거나 느려진다 — 현장에서 바로 티가 난다.

import { describe, it, expect } from 'vitest';
import { toClovaSpeed } from '../providers/clova.tts.js';

describe('toClovaSpeed', () => {
  it('1.0 배속은 0 (기본)', () => {
    expect(toClovaSpeed(1)).toBe(0);
    expect(toClovaSpeed(undefined)).toBe(0);
  });

  it('빠르게 요청하면 음수 (CLOVA 는 음수가 빠르다)', () => {
    expect(toClovaSpeed(1.4)).toBeLessThan(0);
  });

  it('느리게 요청하면 양수', () => {
    expect(toClovaSpeed(0.7)).toBeGreaterThan(0);
  });

  it('허용 범위(-5~5)를 벗어나지 않는다', () => {
    expect(toClovaSpeed(10)).toBe(-5);
    expect(toClovaSpeed(0.01)).toBe(5);
  });
});
