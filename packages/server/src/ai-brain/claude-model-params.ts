// 모델별 파라미터 호환성 헬퍼
// Opus 4.7+/Fable 5 는 sampling 파라미터(temperature/top_p/top_k)와
// thinking:{type:'enabled',budget_tokens} 를 제거 → 전송 시 400.
// 라이브 스모크테스트(2026-06-14)로 확인:
//   opus-4-8 + temperature → 400, opus-4-8 + adaptive → 200, sonnet-4-6 + temperature → 200.

/** Opus 4.7/4.8/4.9, Fable 등 sampling 파라미터를 거부하는 모델인가 */
export function isSamplingForbidden(model: string): boolean {
  return /opus-4-[789]|fable/i.test(model);
}

/**
 * 모델에 맞는 temperature 파라미터 조각을 반환.
 * sampling 금지 모델이면 빈 객체(스프레드 시 temperature 미포함 → 400 방지),
 * 허용 모델이면 { temperature }.
 */
export function temperatureParam(model: string, temperature: number): { temperature?: number } {
  return isSamplingForbidden(model) ? {} : { temperature };
}

// ===========================
// Adaptive Thinking + Effort (Opus 4.6+/Sonnet 4.6/Fable)
// 라이브 스모크테스트(2026-06-14): opus-4-8 + adaptive thinking → 200.
// Opus 4.7/4.8/Fable 은 thinking:{type:'enabled',budget_tokens} 전송 시 400 →
// adaptive 만 허용. Claude 가 추론 깊이를 스스로 결정한다(고정 budget 불필요).
// ===========================

/** adaptive thinking 을 지원(권장)하는 모델인가 — Opus 4.6/4.7/4.8/4.9, Fable, Sonnet 4.6 */
export function supportsAdaptiveThinking(model: string): boolean {
  return /opus-4-[6789]|fable|sonnet-4-6/i.test(model);
}

/** effort(output_config.effort) 를 지원하는 모델인가 — Opus 4.5+, Fable, Sonnet 4.6 (Sonnet 4.5/Haiku 는 미지원→400) */
export function supportsEffort(model: string): boolean {
  return /opus-4-[56789]|fable|sonnet-4-6/i.test(model);
}

// SDK(@anthropic-ai/sdk 0.78) OutputConfig.effort 타입과 일치 — xhigh 는 아직 미타입.
export type EffortLevel = 'low' | 'medium' | 'high' | 'max';

type AdaptiveThinking = { type: 'adaptive' };
type EnabledThinking = { type: 'enabled'; budget_tokens: number };

/**
 * 모델에 맞는 thinking 파라미터 조각을 반환.
 * - adaptive 지원 모델: { thinking: { type: 'adaptive' } } (budget 무시 — Claude 가 결정)
 * - 구형 모델: budget_tokens > 0 이면 { thinking: { type: 'enabled', budget_tokens } }, 아니면 빈 객체
 */
export function thinkingParam(
  model: string,
  budgetTokens: number,
): { thinking?: AdaptiveThinking | EnabledThinking } {
  if (supportsAdaptiveThinking(model)) {
    return { thinking: { type: 'adaptive' } };
  }
  if (budgetTokens > 0) {
    return { thinking: { type: 'enabled', budget_tokens: budgetTokens } };
  }
  return {};
}

/**
 * 모델에 맞는 effort 파라미터 조각을 반환.
 * 지원 모델이면 { output_config: { effort } }, 미지원이면 빈 객체(400 방지).
 */
export function effortParam(
  model: string,
  effort: EffortLevel,
): { output_config?: { effort: EffortLevel } } {
  return supportsEffort(model) ? { output_config: { effort } } : {};
}
