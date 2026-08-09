// 기억 통합(consolidation) — 강화 학습의 심장부.
//
// 같은 이야기를 다시 들으면 **강화**하고, 다른 이야기를 들으면 **대체**하고,
// 오래 확인되지 않으면 **감쇠**한다. 이 세 규칙이 "쌓인다"와 "학습한다"를 가른다.
//
// 이 파일은 순수 함수만 담는다 (DB 접근 없음) — 규칙 자체를 테스트로 고정하기 위함.

import type { MemorySource } from '@cowtalk/shared';

export interface ExistingMemory {
  readonly memoryId: string;
  readonly subject: string;
  readonly content: string;
  readonly confidence: number;
  readonly evidenceCount: number;
  readonly importance: number;
  readonly source: MemorySource;
  readonly lastConfirmedAt: Date;
}

export interface CandidateForConsolidation {
  readonly subject: string;
  readonly content: string;
  readonly confidence: number;
  readonly importance: number;
  readonly source: MemorySource;
}

export type ConsolidationDecision =
  | { readonly kind: 'insert' }
  | {
      readonly kind: 'reinforce';
      readonly targetId: string;
      readonly nextConfidence: number;
      readonly nextEvidenceCount: number;
      readonly nextImportance: number;
    }
  | { readonly kind: 'supersede'; readonly targetId: string };

// ── 텍스트 유사도 ──

/** 조사 — 명사 뒤에 붙어 같은 단어를 다르게 보이게 만든다 */
const TRAILING_PARTICLES = /(으로|에서|에게|한테|까지|부터|이라고|라고|는|은|이|가|을|를|의|에|와|과|도|만|로)$/u;

/**
 * 서술어 어미 — 같은 사실의 재언급을 '다른 문장'으로 보이게 만드는 주범.
 * "보유한다" / "보유하고 있다" / "보유합니다"가 서로 다른 토큰이 되면
 * 반복 언급이 강화(reinforce)가 아니라 대체(supersede)로 잘못 분류된다.
 * 완전한 형태소 분석기가 아니라, 그 오분류를 막을 만큼의 경량 어간 추출이다.
 */
const PREDICATE_ENDINGS =
  /(합니다|했습니다|하였다|한다|하고|하는|해서|해요|했다|하지|이다|입니다|였다|이며|있다|있고|있는|없다|없고|없는|된다|되고|되는|됐다|시킨다|쓴다|쓰고)$/u;

/** 조사 → 어미 순으로 벗겨 어간을 얻는다. 벗겨서 2자 미만이 되면 원형을 유지한다. */
export function stem(token: string): string {
  let out = token.replace(TRAILING_PARTICLES, '');
  if (out.length < 2) out = token;
  const stripped = out.replace(PREDICATE_ENDINGS, '');
  return stripped.length >= 2 ? stripped : out;
}

export function tokenize(text: string): ReadonlySet<string> {
  const tokens = text
    .toLowerCase()
    .split(/[^가-힣a-z0-9]+/u)
    .filter((t) => t.length >= 2)
    .map(stem);
  return new Set(tokens);
}

/**
 * 부정 표현 — "덱사는 쓴다"와 "덱사는 안 쓴다"는 토큰이 거의 같지만 정반대다.
 * 유사도만으로는 이 뒤집힘을 잡을 수 없어 별도 신호로 다룬다.
 */
const NEGATION = /(안\s|안$|않|못\s|없|금지|말고|말라|아니|중단|끊었)/u;

export function hasNegation(text: string): boolean {
  return NEGATION.test(text);
}

/** Jaccard 유사도 — 두 문장이 같은 이야기를 하는지의 근사치 */
export function similarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function normalizeSubject(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/gu, '');
}

// ── 통합 임계값 ──

/** 같은 주제 안에서 "같은 이야기"로 볼 최소 유사도 */
export const REINFORCE_THRESHOLD = 0.55;
/** 주제가 달라도 내용이 거의 같으면 같은 기억으로 본다 */
export const CROSS_SUBJECT_THRESHOLD = 0.8;
/** 강화 시 신뢰도가 남은 거리의 몇 %를 좁히는가 */
const REINFORCE_STEP = 0.35;
/** 신뢰도 상한 — 사용자 발언에 근거한 기억이 100% 확신이 되는 일은 없다 */
export const CONFIDENCE_CEILING = 0.97;

/** 반복 확인된 기억의 신뢰도 — 점근적으로 상한에 접근 (한 번에 확신하지 않는다) */
export function reinforcedConfidence(current: number): number {
  const next = current + (CONFIDENCE_CEILING - current) * REINFORCE_STEP;
  return Math.min(CONFIDENCE_CEILING, Math.round(next * 1000) / 1000);
}

/**
 * 후보 하나를 기존 활성 기억들과 대조해 무엇을 할지 결정한다.
 *
 * - 같은 주제 + 비슷한 내용   → reinforce (증거 누적, 신뢰도 상승)
 * - 같은 주제 + 다른 내용     → supersede (사용자가 말을 바꿨다 = 최신이 맞다)
 * - 다른 주제 + 거의 같은 내용 → reinforce (주제 표기만 다른 중복)
 * - 그 외                     → insert
 */
export function decideConsolidation(
  candidate: CandidateForConsolidation,
  existing: readonly ExistingMemory[],
): ConsolidationDecision {
  const candSubject = normalizeSubject(candidate.subject);

  const sameSubject = existing.filter((m) => normalizeSubject(m.subject) === candSubject);
  if (sameSubject.length > 0) {
    // 같은 주제 중 내용이 가장 가까운 것과 비교
    let best = sameSubject[0]!;
    let bestSim = similarity(candidate.content, best.content);
    for (const m of sameSubject.slice(1)) {
      const sim = similarity(candidate.content, m.content);
      if (sim > bestSim) {
        best = m;
        bestSim = sim;
      }
    }
    // 부정이 뒤집혔으면 아무리 문장이 비슷해도 같은 이야기가 아니다.
    // ("덱사는 쓴다" → "덱사는 안 쓴다"는 강화가 아니라 갱신이다)
    const negationFlipped = hasNegation(candidate.content) !== hasNegation(best.content);

    if (!negationFlipped && bestSim >= REINFORCE_THRESHOLD) {
      return {
        kind: 'reinforce',
        targetId: best.memoryId,
        nextConfidence: reinforcedConfidence(best.confidence),
        nextEvidenceCount: best.evidenceCount + 1,
        // 반복해서 언급되는 주제는 그만큼 중요하다 — 단 상한 5
        nextImportance: Math.min(5, Math.max(best.importance, candidate.importance)),
      };
    }
    // 같은 주제인데 내용이 다르다 = 사용자가 갱신한 것. 최신 발언이 이긴다.
    return { kind: 'supersede', targetId: best.memoryId };
  }

  // 주제 표기가 달라도 사실상 같은 문장이면 중복 축적을 막는다
  for (const m of existing) {
    if (hasNegation(candidate.content) !== hasNegation(m.content)) continue;
    if (similarity(candidate.content, m.content) >= CROSS_SUBJECT_THRESHOLD) {
      return {
        kind: 'reinforce',
        targetId: m.memoryId,
        nextConfidence: reinforcedConfidence(m.confidence),
        nextEvidenceCount: m.evidenceCount + 1,
        nextImportance: Math.min(5, Math.max(m.importance, candidate.importance)),
      };
    }
  }

  return { kind: 'insert' };
}

// ── 감쇠(decay) ──
//
// 오래 재확인되지 않은 기억은 신뢰도가 떨어진다. 목장은 변한다 —
// 3년 전 "우리는 A사료 쓴다"가 영원히 참일 이유가 없다.
// 단, 사용자가 직접 지시한 기억(user_explicit·manual)은 감쇠시키지 않는다.

/** 증거 1건 기억의 반감기(일) — 증거가 쌓일수록 길어진다 */
export const DECAY_HALF_LIFE_DAYS = 120;
/** 이 아래로 떨어지면 회상 대상에서 제외(expired) */
export const EXPIRY_FLOOR = 0.2;

export function isDecayExempt(source: MemorySource): boolean {
  return source === 'user_explicit' || source === 'manual';
}

/** 감쇠 후 신뢰도 — 증거 수만큼 반감기가 늘어난다 (최대 5배) */
export function decayedConfidence(
  confidence: number,
  daysSinceConfirmed: number,
  evidenceCount: number,
  source: MemorySource = 'chat_auto',
): number {
  if (isDecayExempt(source)) return confidence;
  if (daysSinceConfirmed <= 0) return confidence;
  const halfLife = DECAY_HALF_LIFE_DAYS * Math.min(5, Math.max(1, evidenceCount));
  const decayed = confidence * Math.pow(0.5, daysSinceConfirmed / halfLife);
  return Math.round(decayed * 1000) / 1000;
}

export function shouldExpire(confidence: number): boolean {
  return confidence < EXPIRY_FLOOR;
}
