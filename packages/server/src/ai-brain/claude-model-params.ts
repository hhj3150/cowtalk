// 모델별 파라미터 호환성 헬퍼
//
// Anthropic 은 세대가 올라갈 때마다 sampling 파라미터(temperature/top_p/top_k)와
// 고정 budget thinking 을 걷어내고 있다. 지원하지 않는 파라미터를 보내면 400 이라
// 모델 ID 하나만 바꿔도 채팅 전체가 죽는다. 그 판정을 이 파일 한 곳에 모은다.
//
// 라이브 스모크테스트(2026-06-14)로 확인:
//   opus-4-8 + temperature → 400, opus-4-8 + adaptive → 200, sonnet-4-6 + temperature → 200.
//
// ⚠️ 판정 방향: "구형만 명시하고, 모르는 모델은 최신으로 간주한다"
// 이 저장소의 기본 모델은 언제나 최신 세대이고, 새로 들어오는 ID 는 구형보다 신형일
// 가능성이 훨씬 높다. 무엇보다 오판의 대가가 비대칭이다:
//   - 신형을 구형으로 오판 → 지원 안 하는 파라미터 전송 → 400 → 기능 자체가 죽는다
//   - 구형을 신형으로 오판 → 파라미터 생략 → 서버 기본값으로 동작 (품질만 조금 손해)
// 그래서 아래 목록은 전부 "이 이하 구형" 화이트리스트이고, 매칭 실패는 최신 취급이다.

/** sampling 파라미터(temperature 등)를 받아주는 구형 계열 */
const SAMPLING_OK_LEGACY = /claude-3|haiku-4|sonnet-4-[0-6](?!\d)|opus-4-[0-6](?!\d)/i;

/** adaptive thinking 이 없어 고정 budget_tokens 를 써야 하는 구형 계열 */
const PRE_ADAPTIVE_LEGACY = /claude-3|haiku-4|sonnet-4-[0-5](?!\d)|opus-4-[0-5](?!\d)/i;

/** output_config.effort 를 아직 모르는 구형 계열 (전송 시 400) */
const PRE_EFFORT_LEGACY = /claude-3|haiku-4|sonnet-4-[0-5](?!\d)|opus-4-[0-4](?!\d)/i;

/** Opus 4.7+/Fable/Claude 5 등 sampling 파라미터를 거부하는 모델인가 */
export function isSamplingForbidden(model: string): boolean {
  return !SAMPLING_OK_LEGACY.test(model);
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
// Adaptive Thinking + Effort (Opus 4.6+/Sonnet 4.6+/Fable/Claude 5)
// 라이브 스모크테스트(2026-06-14): opus-4-8 + adaptive thinking → 200.
// Opus 4.7/4.8/Fable 은 thinking:{type:'enabled',budget_tokens} 전송 시 400 →
// adaptive 만 허용. Claude 가 추론 깊이를 스스로 결정한다(고정 budget 불필요).
// ===========================

/** adaptive thinking 을 지원(권장)하는 모델인가 — Opus 4.6+, Sonnet 4.6+, Fable, Claude 5 */
export function supportsAdaptiveThinking(model: string): boolean {
  return !PRE_ADAPTIVE_LEGACY.test(model);
}

/** effort(output_config.effort) 를 지원하는 모델인가 — Opus 4.5+, Sonnet 4.6+, Fable, Claude 5 */
export function supportsEffort(model: string): boolean {
  return !PRE_EFFORT_LEGACY.test(model);
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

/**
 * thinking 을 켠 채로 보낼 temperature 조각.
 *
 * 두 제약이 겹치는 자리다:
 *  - 구형 모델 + extended thinking → Anthropic 이 temperature=1 을 강제한다.
 *  - 신형 모델 → temperature 자체를 받지 않는다(400).
 * 호출부마다 이 분기를 다시 쓰면 한쪽을 빠뜨린다. 여기서 한 번만 판단한다.
 */
export function thinkingSafeTemperature(
  model: string,
  thinkingEnabled: boolean,
  temperature: number,
): { temperature?: number } {
  return temperatureParam(model, thinkingEnabled ? 1 : temperature);
}
