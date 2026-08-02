// 에코 가드 — 팅커벨이 자기 목소리를 사용자 발화로 착각하는 것을 막는다.
//
// 왜 필요한가:
//   지금은 답변 중(state === 'speaking')에 wake word 청취를 아예 꺼둔다.
//   스피커로 나가는 자기 음성이 마이크로 되들어와 "팅커벨"을 무한 재호출하기 때문이다.
//   그 대가로 답변 도중에는 사용자가 끼어들 수 없다 — Siri라면 되는 barge-in이 안 된다.
//
// 해결:
//   방금 말한 문장을 기억해두고, 인식된 텍스트가 그것과 충분히 겹치면 에코로 보고 버린다.
//   겹치지 않으면 진짜 사람 말이므로 통과 → 답변 중에도 끼어들기가 가능해진다.
//
// 판정 방식: "가장 긴 공통 연속 문자열" 비율.
//
//   처음에는 음절 2-gram 겹침(bag-of-bigrams)으로 판정했는데 심각한 오작동을 냈다.
//   답변이 길수록 2-gram 집합이 커져서, 사용자가 답변에 나온 단어를 자연스럽게 되쓰는
//   후속 질문("반추 시간은 어때")이 에코로 오판돼 조용히 버려졌다.
//   사용자에게는 "음성 인식이 안 된다"로만 보인다 — 최악의 실패 방식이다.
//
//   에코는 정의상 "같은 말이 같은 순서로" 되돌아온 것이다. 그래서 어휘 겹침이 아니라
//   연속 일치를 본다. 단어를 빌려 쓰는 것과 통째로 따라 하는 것은 전혀 다르다.

/**
 * 발화 기억 유지 시간.
 * 이 창은 "스피커에서 나간 소리가 마이크로 되돌아오는" 물리적 지연만 덮으면 된다.
 * 길게 잡으면 사용자의 다음 발언까지 잡아먹는다.
 */
const DEFAULT_MEMORY_MS = 4000;
/** 들린 말의 이 비율 이상이 발화와 "연속으로" 일치하면 에코 */
const DEFAULT_THRESHOLD = 0.7;
/** 이보다 짧은 인식 결과는 비교가 무의미 — "그만" 같은 짧은 명령을 살려야 한다 */
const MIN_COMPARABLE_CHARS = 6;
/** 연속 일치가 이 길이 미만이면 우연의 일치로 본다 */
const MIN_RUN_CHARS = 6;

interface SpokenEntry {
  readonly text: string;
  readonly expiresAt: number;
}

/** 비교용 정규화 — 공백·문장부호 제거, 소문자화 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s.,!?;:'"()[\]{}·…—-]/g, '')
    .trim();
}

/**
 * heard 안에서 spoken에도 그대로 들어 있는 "가장 긴 연속 문자열"의 길이.
 * heard는 보통 짧으므로(한 발화) 실사용 비용은 무시할 수준이다.
 */
export function longestCommonRun(heard: string, spoken: string): number {
  const a = normalize(heard);
  const b = normalize(spoken);
  if (!a || !b) return 0;

  let best = 0;
  for (let i = 0; i < a.length; i++) {
    // 이미 찾은 것보다 긴 것만 시도 — 길이를 늘려가다 실패하면 즉시 중단
    if (a.length - i <= best) break;
    for (let len = best + 1; i + len <= a.length; len++) {
      if (b.includes(a.slice(i, i + len))) best = len;
      else break;
    }
  }
  return best;
}

/**
 * 들린 말이 발화를 얼마나 "그대로" 따라 하는지 (0~1).
 * 어휘 겹침이 아니라 연속 일치 기준이라, 단어를 빌려 쓴 후속 질문은 낮은 값이 나온다.
 */
export function echoRatio(heard: string, spoken: string): number {
  const a = normalize(heard);
  if (a.length === 0) return 0;
  const run = longestCommonRun(heard, spoken);
  if (run < MIN_RUN_CHARS) return 0;
  return run / a.length;
}

export interface EchoGuardOptions {
  readonly memoryMs?: number;
  readonly threshold?: number;
  /** 테스트 주입용 시계 */
  readonly now?: () => number;
}

export class EchoGuard {
  private entries: SpokenEntry[] = [];
  private readonly memoryMs: number;
  private readonly threshold: number;
  private readonly now: () => number;

  constructor(options: EchoGuardOptions = {}) {
    this.memoryMs = options.memoryMs ?? DEFAULT_MEMORY_MS;
    this.threshold = options.threshold ?? DEFAULT_THRESHOLD;
    this.now = options.now ?? (() => Date.now());
  }

  /** 팅커벨이 말하기 시작한 텍스트를 기억한다. TTS 청크마다 호출. */
  noteSpoken(text: string): void {
    const normalized = normalize(text);
    if (!normalized) return;
    this.prune();
    this.entries.push({ text: normalized, expiresAt: this.now() + this.memoryMs });
  }

  /**
   * 들린 텍스트가 자기 음성의 에코인지.
   *
   * 판정은 보수적이다 — 애매하면 통과시킨다.
   * 에코를 한 번 놓치면 헛질문 하나로 끝나지만, 사용자의 말을 한 번 삼키면
   * "음성이 안 된다"가 되어 기능 자체를 못 쓰게 된다.
   */
  isEcho(heard: string): boolean {
    const normalized = normalize(heard);
    // 짧은 발화는 판정하지 않는다 — "그만" 같은 중단 명령을 반드시 살려야 한다
    if (normalized.length < MIN_COMPARABLE_CHARS) return false;

    this.prune();
    if (this.entries.length === 0) return false;

    for (const entry of this.entries) {
      if (echoRatio(normalized, entry.text) >= this.threshold) return true;
    }
    return false;
  }

  /**
   * 기억을 즉시 비운다.
   * 사용자를 향해 마이크를 여는 순간(마이크 버튼·호명) 반드시 호출해야 한다 —
   * 그 시점엔 이미 자기 음성을 멈춘 뒤이므로, 이전 발화는 에코 판정 근거가 될 수 없다.
   */
  clear(): void {
    this.entries = [];
  }

  private prune(): void {
    const t = this.now();
    if (this.entries.some((e) => e.expiresAt <= t)) {
      this.entries = this.entries.filter((e) => e.expiresAt > t);
    }
  }
}
