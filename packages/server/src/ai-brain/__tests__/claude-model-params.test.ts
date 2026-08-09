// claude-model-params 테스트 — 모델별 파라미터 호환성
// 라이브 스모크테스트(2026-06-14)로 확인된 계약:
//   - opus-4-8 + temperature → 400 ("temperature is deprecated for this model")
//   - sonnet-4-6 + temperature → 200
//   - opus-4-8 + adaptive thinking → 200

import { describe, it, expect } from 'vitest';
import {
  isSamplingForbidden,
  supportsAdaptiveThinking,
  supportsEffort,
  temperatureParam,
  thinkingParam,
  effortParam,
  thinkingSafeTemperature,
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
interface ModelExpectation {
  readonly model: string;
  readonly samplingForbidden: boolean;
  readonly adaptive: boolean;
  readonly effort: boolean;
}

// 세대별 기대값. 구형은 명시 나열, 신형·미지의 ID 는 전부 "최신" 취급이 정답이다.
const MATRIX: readonly ModelExpectation[] = [
  // --- Claude 3 계열: 전부 미지원 ---
  { model: 'claude-3-5-sonnet-20241022', samplingForbidden: false, adaptive: false, effort: false },
  { model: 'claude-3-7-sonnet-latest',   samplingForbidden: false, adaptive: false, effort: false },

  // --- Haiku 4.x: 경량 모델, 고급 파라미터 미지원 ---
  { model: 'claude-haiku-4-5-20251001',  samplingForbidden: false, adaptive: false, effort: false },

  // --- Sonnet 4.x ---
  { model: 'claude-sonnet-4-5',          samplingForbidden: false, adaptive: false, effort: false },
  // 실측: sonnet-4-6 + temperature → 200. adaptive/effort 는 지원.
  { model: 'claude-sonnet-4-6',          samplingForbidden: false, adaptive: true,  effort: true  },

  // --- Opus 4.x: effort 는 4.5부터, adaptive 는 4.6부터, sampling 금지는 4.7부터 ---
  { model: 'claude-opus-4-4',            samplingForbidden: false, adaptive: false, effort: false },
  { model: 'claude-opus-4-5',            samplingForbidden: false, adaptive: false, effort: true  },
  { model: 'claude-opus-4-6',            samplingForbidden: false, adaptive: true,  effort: true  },
  { model: 'claude-opus-4-7',            samplingForbidden: true,  adaptive: true,  effort: true  },
  // 실측: opus-4-8 + temperature → 400, opus-4-8 + adaptive → 200.
  { model: 'claude-opus-4-8',            samplingForbidden: true,  adaptive: true,  effort: true  },

  // --- Claude 5 계열: 전부 최신 규약 ---
  { model: 'claude-opus-5',              samplingForbidden: true,  adaptive: true,  effort: true  },
  { model: 'claude-sonnet-5',            samplingForbidden: true,  adaptive: true,  effort: true  },
  { model: 'claude-fable-5',             samplingForbidden: true,  adaptive: true,  effort: true  },
];

describe('모델 파라미터 호환성 행렬', () => {
  for (const { model, samplingForbidden, adaptive, effort } of MATRIX) {
    it(`${model}`, () => {
      expect(isSamplingForbidden(model), 'sampling').toBe(samplingForbidden);
      expect(supportsAdaptiveThinking(model), 'adaptive').toBe(adaptive);
      expect(supportsEffort(model), 'effort').toBe(effort);
    });
  }
});

describe('모르는 모델은 최신으로 간주한다', () => {
  // 오판의 대가가 비대칭이다: 신형을 구형으로 보면 400(기능 사망),
  // 구형을 신형으로 보면 파라미터 생략(품질 손해). 후자를 택한다.
  const UNKNOWN = ['claude-opus-6', 'claude-sonnet-7-1', 'claude-next-experimental', ''];

  for (const model of UNKNOWN) {
    it(`'${model}' → sampling 금지 / adaptive·effort 지원`, () => {
      expect(isSamplingForbidden(model)).toBe(true);
      expect(supportsAdaptiveThinking(model)).toBe(true);
      expect(supportsEffort(model)).toBe(true);
    });
  }

  it('두 자리 마이너 버전이 한 자리로 오인되지 않는다', () => {
    // 'opus-4-10' 이 'opus-4-1' 로 잘려 구형 취급되면 sampling 파라미터를 보내 400 이 난다.
    expect(isSamplingForbidden('claude-opus-4-10')).toBe(true);
    expect(isSamplingForbidden('claude-sonnet-4-12')).toBe(true);
  });

  it('날짜 접미사가 붙어도 같은 세대로 판정한다', () => {
    expect(isSamplingForbidden('claude-opus-4-8-20260101')).toBe(true);
    expect(isSamplingForbidden('claude-sonnet-4-6-20260101')).toBe(false);
  });
});

describe('Claude 5 계열 파라미터 조각', () => {
  it('sampling 금지 모델에는 temperature 키 자체가 없다', () => {
    // toEqual({}) 로는 부족하다 — undefined 를 담아도 SDK 가 직렬화하면 400 이므로
    // 키의 부재 자체를 본다.
    expect(Object.hasOwn(temperatureParam('claude-opus-5', 0.4), 'temperature')).toBe(false);
  });

  it('adaptive 지원 모델은 budget 을 무시하고 adaptive 로 간다', () => {
    expect(thinkingParam('claude-opus-5', 2048)).toEqual({ thinking: { type: 'adaptive' } });
    expect(thinkingParam('claude-sonnet-5', 0)).toEqual({ thinking: { type: 'adaptive' } });
  });

  it('effort 를 그대로 싣는다', () => {
    expect(effortParam('claude-opus-5', 'high')).toEqual({ output_config: { effort: 'high' } });
  });
});

describe('thinkingSafeTemperature — 두 제약이 겹치는 자리', () => {
  it('구형 + thinking 켜짐 → Anthropic 강제값 1', () => {
    expect(thinkingSafeTemperature('claude-sonnet-4-5', true, 0.4)).toEqual({ temperature: 1 });
  });

  it('구형 + thinking 꺼짐 → 설정값 그대로', () => {
    expect(thinkingSafeTemperature('claude-sonnet-4-5', false, 0.4)).toEqual({ temperature: 0.4 });
  });

  it('신형은 thinking 여부와 무관하게 temperature 를 보내지 않는다', () => {
    // 여기가 실제로 터졌던 자리다: 'thinking 이면 1' 분기만 보고 temperature 를
    // 그대로 실어 보내면 Claude 5 계열에서 채팅 전 요청이 400 이 된다.
    expect(thinkingSafeTemperature('claude-opus-5', true, 0.4)).toEqual({});
    expect(thinkingSafeTemperature('claude-opus-5', false, 0.4)).toEqual({});
  });
});
