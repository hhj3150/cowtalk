// claude-model-params 테스트 — 모델별 파라미터 호환성
// 라이브 스모크테스트(2026-06-14)로 확인된 계약:
//   - opus-4-8 + temperature → 400 ("temperature is deprecated for this model")
//   - sonnet-4-6 + temperature → 200
//   - opus-4-8 + adaptive thinking → 200

import { describe, it, expect } from 'vitest';
import {
  isSamplingForbidden,
  temperatureParam,
  thinkingParam,
  effortParam,
} from '../claude-model-params.js';

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

describe('thinkingParam', () => {
  it('adaptive 지원 모델(Opus 4.6+/Sonnet 4.6/Fable)은 adaptive thinking 반환', () => {
    // budget_tokens 전송 시 400 → adaptive 만 허용
    expect(thinkingParam('claude-opus-4-8', 2048)).toEqual({ thinking: { type: 'adaptive' } });
    expect(thinkingParam('claude-opus-4-7', 2048)).toEqual({ thinking: { type: 'adaptive' } });
    expect(thinkingParam('claude-opus-4-6', 2048)).toEqual({ thinking: { type: 'adaptive' } });
    expect(thinkingParam('claude-sonnet-4-6', 2048)).toEqual({ thinking: { type: 'adaptive' } });
    expect(thinkingParam('claude-fable-5', 2048)).toEqual({ thinking: { type: 'adaptive' } });
  });

  it('구형 모델(Sonnet 4.5 등)은 enabled + budget_tokens 반환', () => {
    expect(thinkingParam('claude-sonnet-4-5-20250929', 2048)).toEqual({
      thinking: { type: 'enabled', budget_tokens: 2048 },
    });
  });

  it('budget_tokens <= 0 이면 thinking 미포함(빈 객체)', () => {
    expect(thinkingParam('claude-sonnet-4-5-20250929', 0)).toEqual({});
    // adaptive 모델은 budget 과 무관하게 항상 adaptive (Claude 가 깊이 결정)
    expect(thinkingParam('claude-opus-4-8', 0)).toEqual({ thinking: { type: 'adaptive' } });
  });
});

describe('effortParam', () => {
  it('effort 지원 모델(Opus 4.5+/Sonnet 4.6/Fable)은 output_config.effort 반환', () => {
    expect(effortParam('claude-opus-4-8', 'high')).toEqual({ output_config: { effort: 'high' } });
    expect(effortParam('claude-sonnet-4-6', 'medium')).toEqual({
      output_config: { effort: 'medium' },
    });
    expect(effortParam('claude-opus-4-5-20251101', 'max')).toEqual({
      output_config: { effort: 'max' },
    });
  });

  it('effort 미지원 모델(Sonnet 4.5/Haiku 4.5)은 빈 객체(400 방지)', () => {
    expect(effortParam('claude-sonnet-4-5-20250929', 'high')).toEqual({});
    expect(effortParam('claude-haiku-4-5', 'high')).toEqual({});
  });
});
