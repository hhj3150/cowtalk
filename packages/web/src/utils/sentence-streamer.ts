// 스트리밍 텍스트 → 완전한 문장 추출 유틸.
//
// 사용: Claude SSE 스트리밍 중 누적 텍스트에서 새로 완성된 문장만 떼어내
// TTS 큐에 enqueue. 미완성 꼬리는 remainder로 보존하여 다음 chunk에 누적.
//
// 한국어 종결 어미('-다.', '-요?', '-까?' 등) + 일반 부호(. ! ? 。 …) 처리.
// 너무 짧은 토막(< minLength)은 다음 문장과 합쳐 어색한 끊김 방지.

export interface SentenceSplitResult {
  /** 완성된 문장(들). 호출자가 차례로 TTS enqueue. */
  readonly sentences: readonly string[];
  /** 아직 완성되지 않은 꼬리. 다음 호출 때 새 chunk와 합쳐 다시 처리. */
  readonly remainder: string;
}

// 한국어 종결 어미 + 일반 부호. 부호 뒤에 공백/줄바꿈/끝이 와야 종료로 인정.
// '·다.', '·요.', '·죠.', '·까?', '·니다.', '·데요.' 등 한국어 종결 다수 + . ! ? 。 …
const SENTENCE_END_RE = /([다요죠까니데]\.|[.!?。…!?])(?=[\s\n]|$)/gu;

const DEFAULT_MIN_LENGTH = 12;

/**
 * 누적 텍스트를 받아 완성된 문장들과 미완성 꼬리를 반환.
 *
 * 사용 패턴:
 * ```ts
 * let buffer = '';
 * onStreamChunk((chunk) => {
 *   buffer += chunk;
 *   const { sentences, remainder } = extractCompleteSentences(buffer);
 *   sentences.forEach(s => enqueueSpeech(s));
 *   buffer = remainder; // 미완성 꼬리만 남김
 * });
 * onStreamEnd(() => {
 *   if (buffer.trim()) enqueueSpeech(buffer); // 종결 부호 없는 마지막 토막
 * });
 * ```
 *
 * @param minLength 단독 발화하기에 너무 짧은 한도. 미만이면 다음 문장과 합침.
 */
export function extractCompleteSentences(
  text: string,
  minLength: number = DEFAULT_MIN_LENGTH,
): SentenceSplitResult {
  if (!text) return { sentences: [], remainder: '' };

  const sentences: string[] = [];
  let cursor = 0;
  let pending = '';
  let match: RegExpExecArray | null;
  SENTENCE_END_RE.lastIndex = 0;

  while ((match = SENTENCE_END_RE.exec(text)) !== null) {
    const endIdx = match.index + match[0].length;
    const slice = text.slice(cursor, endIdx).trim();
    cursor = endIdx;

    const combined = pending ? `${pending} ${slice}`.trim() : slice;
    if (combined.length >= minLength) {
      sentences.push(combined);
      pending = '';
    } else {
      // 너무 짧음 — 다음 문장과 합쳐서 다시 시도
      pending = combined;
    }
  }

  const tail = text.slice(cursor);
  const remainder = (pending
    ? (tail ? `${pending} ${tail}` : pending)
    : tail).replace(/^\s+/, ''); // 선두 공백 제거 (꼬리에 누적된 공백 누수 방지)

  return { sentences, remainder };
}
