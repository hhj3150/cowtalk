// 스트리밍 문장 분할기 — 답변이 완성되기 전에 말하기 시작하기 위한 핵심 부품.
//
// 문제:
//   지금은 SSE 스트림이 전부 끝난 뒤에야 TTS를 요청한다.
//   답변 생성 4초 + TTS 합성 2초 = 첫 소리까지 6초. 현장에서는 "먹통"으로 느껴진다.
//
// 해결:
//   텍스트가 흘러들어오는 대로 문장 경계에서 잘라 즉시 합성한다.
//   첫 청크는 짧게(빨리 말을 떼기 위해), 이후 청크는 길게(문장이 토막나지 않게).
//   → 첫 소리까지 1초 내외.
//
// 음성으로 읽으면 안 되는 것(코드블록·SVG·표)은 청크에서 제외한다.

/** 문장 종결 문자 — 한국어·영어·키릴 공통 */
const SENTENCE_END = /[.!?。！？…]/;

export interface ChunkOptions {
  /**
   * 첫 청크 최소 길이. 아주 작게 잡는다 — 첫 문장이 짧으면 짧은 대로 즉시 말하는 게
   * 체감 응답속도에 결정적이다. TTS 요청 한 번을 더 쓰는 대신 침묵을 없앤다.
   */
  readonly firstMinChars?: number;
  /** 이후 청크 최소 길이 — 너무 짧으면 문장이 토막나 부자연스럽다 */
  readonly minChars?: number;
  /** 청크 최대 길이 — 종결부호가 안 나와도 여기서 끊는다 */
  readonly maxChars?: number;
}

export interface ChunkResult {
  /** 지금 바로 합성할 수 있는 완성 청크들 */
  readonly chunks: readonly string[];
  /** 아직 문장이 끝나지 않아 다음 호출로 넘길 나머지 */
  readonly rest: string;
}

// 첫 청크는 하한 없이(1) 첫 종결부호에서 바로 자른다 — "네, 확인했습니다." 같은 짧은 문장도
// 즉시 소리로 내보내는 게 체감 응답속도를 좌우한다. 이후 청크는 45자 이상 모아 자연스럽게 읽는다.
const DEFAULTS = { firstMinChars: 1, minChars: 45, maxChars: 220 } as const;

/**
 * 누적 버퍼에서 발화 가능한 완성 청크를 뽑아낸다.
 *
 * @param buffer  아직 발화하지 않은 누적 텍스트
 * @param isFirst 이 호출이 답변의 첫 청크를 찾는 중인지 (첫 청크는 기준을 낮춘다)
 * @param flush   스트림이 끝났으니 남은 것을 모두 내보낼지
 */
export function extractChunks(
  buffer: string,
  isFirst: boolean,
  flush: boolean,
  options: ChunkOptions = {},
): ChunkResult {
  const firstMin = options.firstMinChars ?? DEFAULTS.firstMinChars;
  const min = options.minChars ?? DEFAULTS.minChars;
  const max = options.maxChars ?? DEFAULTS.maxChars;

  const chunks: string[] = [];
  let rest = buffer;
  let first = isFirst;

  for (;;) {
    const threshold = first ? firstMin : min;
    const cut = findCutPoint(rest, threshold, max);
    if (cut === null) break;

    const piece = rest.slice(0, cut).trim();
    rest = rest.slice(cut);
    if (piece) {
      chunks.push(piece);
      first = false;
    }
  }

  if (flush) {
    const tail = rest.trim();
    if (tail) chunks.push(tail);
    rest = '';
  }

  return { chunks, rest };
}

/**
 * 자를 위치를 찾는다. 우선순위:
 *   1) threshold 이후 첫 문장 종결부호 (가장 자연스러움)
 *   2) threshold 이후 첫 줄바꿈 (목록·단락 경계)
 *   3) max를 넘겼으면 가장 가까운 쉼표/공백 (강제 분할)
 * 자를 곳이 없으면 null.
 */
function findCutPoint(text: string, threshold: number, max: number): number | null {
  if (text.length < threshold) return null;

  // threshold는 "이만큼은 모아라"는 하한이므로 그 앞의 종결부호는 볼 필요가 없다.
  const scanFrom = Math.max(0, threshold - 1);

  // 1) 문장 종결부호 — 소수점(38.5도)이나 약어 뒤가 아닌 경우만
  for (let i = scanFrom; i < text.length && i < max; i++) {
    const ch = text[i];
    if (!ch || !SENTENCE_END.test(ch)) continue;
    if (isDecimalPoint(text, i)) continue;
    // 종결부호 뒤에 공백·줄바꿈·끝이 와야 진짜 문장 끝
    const next = text[i + 1];
    if (next === undefined) {
      // 스트림이 더 올 수 있으므로 끝에 걸친 종결부호는 확정하지 않는다
      return null;
    }
    if (/[\s"')\]}]/.test(next)) return i + 1;
  }

  // 2) 줄바꿈
  const nlIdx = text.indexOf('\n', scanFrom);
  if (nlIdx >= 0 && nlIdx < max) return nlIdx + 1;

  // 3) max 초과 — 쉼표나 공백에서 강제 분할
  if (text.length > max) {
    for (let i = max; i > threshold; i--) {
      const ch = text[i];
      if (ch === ',' || ch === '،' || ch === '、') return i + 1;
    }
    for (let i = max; i > threshold; i--) {
      if (text[i] === ' ') return i + 1;
    }
    return max;
  }

  return null;
}

/** "38.5도" 의 점처럼 숫자 사이에 낀 마침표인지 */
function isDecimalPoint(text: string, index: number): boolean {
  if (text[index] !== '.') return false;
  const prev = text[index - 1];
  const next = text[index + 1];
  return prev !== undefined && next !== undefined && /\d/.test(prev) && /\d/.test(next);
}

/**
 * 음성으로 읽으면 안 되는 블록을 제거한다.
 * 코드블록·SVG·마크다운 표는 TTS에서 의미 없는 소음이 된다.
 */
export function stripUnspeakableBlocks(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')       // 완결된 코드블록
    .replace(/```[\s\S]*$/g, ' ')           // 스트리밍 중 열린 코드블록 — 뒤를 통째로 보류
    .replace(/^\s*\|.*\|\s*$/gm, ' ')       // 마크다운 표 행
    .replace(/^\s*\|?[-: ]+\|[-:| ]*$/gm, ' '); // 표 구분선
}

/**
 * 스트리밍 TTS 청크 누적기. 상태를 가진 얇은 래퍼 — 훅에서 ref로 들고 쓴다.
 *
 * 사용:
 *   const acc = new ChunkAccumulator();
 *   acc.push(deltaText).forEach(speak);   // SSE 델타마다
 *   acc.flush().forEach(speak);           // 스트림 종료 시
 */
export class ChunkAccumulator {
  private buffer = '';
  private isFirst = true;
  private readonly options: ChunkOptions;

  constructor(options: ChunkOptions = {}) {
    this.options = options;
  }

  /** 새로 도착한 텍스트를 넣고, 지금 발화 가능한 청크들을 돌려준다. */
  push(delta: string): readonly string[] {
    this.buffer += delta;
    const speakable = stripUnspeakableBlocks(this.buffer);
    // 코드블록이 열린 채면 stripUnspeakableBlocks가 뒤를 잘라내므로 그만큼은 보류된다.
    const { chunks, rest } = extractChunks(speakable, this.isFirst, false, this.options);
    if (chunks.length > 0) {
      this.isFirst = false;
      this.buffer = rest;
    }
    return chunks;
  }

  /** 스트림 종료 — 남은 것을 모두 내보낸다. */
  flush(): readonly string[] {
    const speakable = stripUnspeakableBlocks(this.buffer);
    const { chunks } = extractChunks(speakable, this.isFirst, true, this.options);
    this.buffer = '';
    this.isFirst = true;
    return chunks;
  }

  reset(): void {
    this.buffer = '';
    this.isFirst = true;
  }
}
