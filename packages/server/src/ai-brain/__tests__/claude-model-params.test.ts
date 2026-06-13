// claude-model-params 테스트 — 모델별 파라미터 호환성
// 라이브 스모크테스트(2026-06-14)로 확인된 계약:
//   - opus-4-8 + temperature → 400 ("temperature is deprecated for this model")
//   - sonnet-4-6 + temperature → 200
//   - opus-4-8 + adaptive thinking → 200

import { describe, it, expect } from 'vitest';
import { isSamplingForbidden, temperatureParam } from '../claude-model-params.js';

describe('isSamplingForbidden', () => {
  it('Opus 4.7/4.8 와 Fable 은 sampling 금지(true)', () => {
    expect(isSamplingForbidden('claude-opus-4-8')).toBe(true);
    expect(isSamplingForbidden('claude-opus-4-7')).toBe(true);
    expect(isSamplingForbidden('claude-fable-5')).toBe(true);
  });

  it('Sonnet 4.6 / Opus 4.5 / Haiku 는 sampling 허용(false)', () => {
    expect(isSamplingForbidden('claude-sonnet-4-6')).toBe(false);
    expect(isSamplingForbidden('claude-sonnet-4-5-20250929')).toBe(false);
    expect(isSamplingForbidden('claude-opus-4-5-20251101')).toBe(false);
    expect(isSamplingForbidden('claude-haiku-4-5')).toBe(false);
  });
});

describe('temperatureParam', () => {
  it('sampling 금지 모델이면 빈 객체(temperature 제거 → 400 방지)', () => {
    expect(temperatureParam('claude-opus-4-8', 0.3)).toEqual({});
  });

  it('sampling 허용 모델이면 temperature 포함', () => {
    expect(temperatureParam('claude-sonnet-4-6', 0.3)).toEqual({ temperature: 0.3 });
  });
});
