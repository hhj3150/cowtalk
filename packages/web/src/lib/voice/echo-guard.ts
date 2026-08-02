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
// 판정 방식: 음절 2-gram 자카드 유사도.
//   음성 인식은 조사·어미를 자주 흘리므로 완전 일치 비교는 쓸 수 없고,
//   2-gram 겹침 비율이 짧은 발화에도 안정적이다.

/** 발화 기억 유지 시간 — 스피커 잔향과 인식 지연을 감안한 여유 */
const DEFAULT_MEMORY_MS = 12_000;
/** 이 비율 이상 겹치면 에코로 판정 */
const DEFAULT_THRESHOLD = 0.45;
/** 이보다 짧은 인식 결과는 비교가 무의미 — 별도 규칙으로 처리 */
const MIN_COMPARABLE_CHARS = 4;

interface SpokenEntry {
  readonly grams: ReadonlySet<string>;
  readonly expiresAt: number;
}

/** 비교용 정규화 — 공백·문장부호 제거, 소문자화 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s.,!?;:'"()[\]{}·…—-]/g, '')
    .trim();
}

/** 음절 2-gram 집합. 3글자 미만이면 글자 자체를 원소로 쓴다. */
export function toBigrams(text: string): Set<string> {
  const s = normalize(text);
  const grams = new Set<string>();
  if (s.length === 0) return grams;
  if (s.length < 2) {
    grams.add(s);
    return grams;
  }
  for (let i = 0; i < s.length - 1; i++) {
    grams.add(s.slice(i, i + 2));
  }
  return grams;
}

/**
 * 들린 말이 기억된 발화에 얼마나 포함되는지 (0~1).
 * 자카드가 아니라 "들린 쪽 기준 포함율"을 쓴다 — 긴 답변의 일부만 에코로 들어오는 게 정상이므로.
 */
export function containmentRatio(heard: ReadonlySet<string>, spoken: ReadonlySet<string>): number {
  if (heard.size === 0) return 0;
  let hit = 0;
  for (const g of heard) {
    if (spoken.has(g)) hit++;
  }
  return hit / heard.size;
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
    const grams = toBigrams(text);
    if (grams.size === 0) return;
    this.prune();
    this.entries.push({ grams, expiresAt: this.now() + this.memoryMs });
  }

  /**
   * 들린 텍스트가 자기 음성의 에코인지.
   * 너무 짧아 비교가 무의미한 입력은 에코로 보지 않는다 — 사용자의 "그만" 같은 짧은 명령을 살리기 위해.
   */
  isEcho(heard: string): boolean {
    const normalized = normalize(heard);
    if (normalized.length < MIN_COMPARABLE_CHARS) return false;

    this.prune();
    if (this.entries.length === 0) return false;

    const heardGrams = toBigrams(heard);
    for (const entry of this.entries) {
      if (containmentRatio(heardGrams, entry.grams) >= this.threshold) return true;
    }
    return false;
  }

  /** 발화가 완전히 끝나고 잔향도 없을 때 (사용자가 명시적으로 중단시킨 경우 등) */
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
