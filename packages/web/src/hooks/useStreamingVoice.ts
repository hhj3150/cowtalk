// 스트리밍 음성 출력 — 답변이 완성되기 전에 말을 시작한다.
//
// 기존 useVoiceOutput은 "완성된 답변 한 덩어리"를 받아 합성한다.
// 그래서 답변 생성이 끝날 때까지(4~8초) 아무 소리도 안 나고, 거기에 합성 시간이 또 붙는다.
//
// 이 훅은 문장 단위로 받는다:
//   - 청크가 들어오는 즉시 합성 요청을 띄운다 (여러 청크가 동시에 합성됨)
//   - 재생은 반드시 들어온 순서대로 (문장이 뒤섞이면 말이 안 된다)
//   → 첫 소리까지 1초 내외. 뒤 문장은 앞 문장을 재생하는 동안 미리 합성돼 끊김이 없다.
//
// 동시 합성은 MAX_INFLIGHT로 제한한다 — 긴 답변에서 TTS 요청이 수십 개 터지는 것을 막는다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { speak as synthesize, type TtsVoice } from '@web/api/audio.api';

/** 동시에 합성 요청을 띄울 최대 개수 — 비용·rate limit 보호 */
const MAX_INFLIGHT = 3;

interface QueueItem {
  readonly seq: number;
  readonly text: string;
  /** 합성 결과. 실패 시 null (해당 문장만 건너뛰고 대화는 계속된다) */
  readonly blob: Promise<Blob | null>;
}

export interface UseStreamingVoiceOptions {
  readonly voice?: TtsVoice;
  /** 청크 하나의 합성 상한 — 청크는 이미 문장 단위라 넉넉하면 충분 */
  readonly maxChars?: number;
  /** 첫 청크 재생 직전에 호출 — 상태를 'speaking'으로 바꾸는 용도 */
  readonly onFirstAudio?: () => void;
  /** 청크를 실제로 발화하기 직전 — EchoGuard에 기억시키는 용도 */
  readonly onWillSpeak?: (text: string) => void;
  /** 큐가 완전히 비고 재생이 끝났을 때 */
  readonly onDrained?: () => void;
  /** 합성이 한 건도 성공하지 못했을 때 — 호출자가 브라우저 TTS로 폴백한다 */
  readonly onAllFailed?: (fullText: string) => void;
  /**
   * 합성·재생 실패를 사용자에게 알리기 위한 콜백.
   * 예전엔 console.warn만 남기고 조용히 무음이 됐다 — 사용자는 원인을 알 방법이 없었다.
   */
  readonly onError?: (message: string) => void;
}

export interface UseStreamingVoiceReturn {
  readonly isSpeaking: boolean;
  /** 문장 청크를 큐에 넣는다 (합성은 즉시 시작, 재생은 순서대로) */
  readonly enqueue: (text: string) => void;
  /** 더 이상 청크가 없음을 알린다 — 큐가 비면 onDrained가 호출된다 */
  readonly end: () => void;
  /** 즉시 중단 + 큐 비우기 (barge-in) */
  readonly stop: () => void;
  /** 새 답변 시작 — 이전 상태 초기화 */
  readonly reset: () => void;
}

export function useStreamingVoice(options: UseStreamingVoiceOptions = {}): UseStreamingVoiceReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const queueRef = useRef<QueueItem[]>([]);
  const seqRef = useRef(0);
  const inflightRef = useRef(0);
  const pendingTextRef = useRef<string[]>([]); // MAX_INFLIGHT 초과분 대기열
  const endedRef = useRef(false);
  const drainingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  /** stop() 이후 도착하는 비동기 결과를 무시하기 위한 세대 카운터 */
  const generationRef = useRef(0);
  const spokenAnythingRef = useRef(false);
  const allTextRef = useRef('');

  // 옵션 콜백은 ref로 — 매 렌더 새 함수가 와도 드레인 루프가 재시작되지 않도록
  const optsRef = useRef(options);
  optsRef.current = options;

  // iOS Safari는 새로 만든 Audio 엘리먼트마다 사용자 제스처를 요구하는 경향이 있다.
  // 문장마다 new Audio()를 만들면 두 번째 문장부터 재생이 막힌다 → 엘리먼트 하나를 재사용하고
  // src만 갈아끼운다. 첫 재생만 제스처(unlockTts) 안에서 열리면 이후는 계속 흐른다.
  const getAudioElement = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'auto';
    }
    return audioRef.current;
  }, []);

  /** 재생만 멈추고 엘리먼트는 살려둔다 (iOS 활성화 상태 유지) */
  const releaseAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  // 언마운트 시에는 엘리먼트까지 완전히 버린다
  useEffect(() => {
    return () => {
      releaseAudio();
      audioRef.current = null;
    };
  }, [releaseAudio]);

  /** 대기열에서 꺼내 합성 요청을 띄운다 (MAX_INFLIGHT 한도 내에서) */
  const pumpSynthesis = useCallback(() => {
    const generation = generationRef.current;
    while (inflightRef.current < MAX_INFLIGHT && pendingTextRef.current.length > 0) {
      const text = pendingTextRef.current.shift();
      if (text === undefined) break;

      inflightRef.current++;
      const seq = seqRef.current++;
      const blob = synthesize({ text, voice: optsRef.current.voice, maxChars: optsRef.current.maxChars })
        .then((r) => r.audioBlob)
        .catch((err: unknown) => {
          const status = (err as { status?: number })?.status;
          const msg = err instanceof Error ? err.message : String(err);
          console.warn('[streaming-voice] 청크 합성 실패:', msg);
          optsRef.current.onError?.(
            status === 503 ? '음성 합성이 서버에 설정되지 않았습니다 (OPENAI_API_KEY 확인 필요)'
            : status === 502 ? `음성 서비스 오류: ${msg}`
            : status === 401 ? '음성 요청 인증 실패 — 다시 로그인해 주세요'
            : `음성 합성 실패: ${msg}`,
          );
          return null;
        })
        .finally(() => {
          // reset()이 카운터를 0으로 되돌린 뒤 늦게 도착한 응답이 음수로 만들지 않도록
          inflightRef.current = Math.max(0, inflightRef.current - 1);
          if (generationRef.current === generation) pumpSynthesis();
        });

      queueRef.current.push({ seq, text, blob });
    }
  }, []);

  const playBlob = useCallback(
    (blob: Blob, generation: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (generationRef.current !== generation) { resolve(); return; }

        releaseAudio();
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        const audio = getAudioElement();
        audio.src = url;

        let settled = false;
        const done = (): void => {
          if (settled) return;
          settled = true;
          resolve();
        };

        audio.onended = done;
        audio.onerror = done;

        audio.play().then(
          () => setIsSpeaking(true),
          (err: unknown) => {
            const name = (err as { name?: string })?.name ?? '';
            console.warn('[streaming-voice] 재생 실패:', name);
            optsRef.current.onError?.(
              name === 'NotAllowedError'
                ? '브라우저가 자동 재생을 차단했습니다. 화면을 한 번 누른 뒤 다시 시도해 주세요.'
                : name === 'NotSupportedError'
                  ? '오디오 형식을 재생할 수 없습니다 (전송 중 손상 의심)'
                  : `오디오 재생 실패: ${name || 'unknown'}`,
            );
            done();
          },
        );
      }),
    [releaseAudio, getAudioElement],
  );

  /** 큐를 순서대로 재생한다. 한 번에 하나만 돌도록 drainingRef로 잠근다. */
  const drain = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    const generation = generationRef.current;

    try {
      for (;;) {
        if (generationRef.current !== generation) return;

        const head = queueRef.current[0];
        if (!head) {
          // 큐가 비었다 — 더 올 게 없으면 종료, 아직 오는 중이면 잠시 양보
          if (endedRef.current && inflightRef.current === 0 && pendingTextRef.current.length === 0) break;
          await new Promise((r) => setTimeout(r, 60));
          continue;
        }

        const blob = await head.blob;
        if (generationRef.current !== generation) return;
        queueRef.current.shift();

        if (!blob) continue; // 이 문장만 실패 — 다음 문장으로

        if (!spokenAnythingRef.current) {
          spokenAnythingRef.current = true;
          optsRef.current.onFirstAudio?.();
        }
        optsRef.current.onWillSpeak?.(head.text);

        await playBlob(blob, generation);
      }
    } finally {
      // 세대가 이미 넘어갔다면 새 드레인 루프가 돌고 있을 수 있다 — 그 잠금을 풀면 중복 재생이 된다.
      if (generationRef.current === generation) {
        drainingRef.current = false;
        setIsSpeaking(false);
        if (!spokenAnythingRef.current && allTextRef.current.trim()) {
          optsRef.current.onAllFailed?.(allTextRef.current.trim());
        } else {
          optsRef.current.onDrained?.();
        }
      }
    }
  }, [playBlob]);

  const enqueue = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    allTextRef.current += (allTextRef.current ? ' ' : '') + trimmed;
    pendingTextRef.current.push(trimmed);
    pumpSynthesis();
    void drain();
  }, [pumpSynthesis, drain]);

  const end = useCallback(() => {
    endedRef.current = true;
    void drain();
  }, [drain]);

  const stop = useCallback(() => {
    generationRef.current++;
    queueRef.current = [];
    pendingTextRef.current = [];
    endedRef.current = true;
    drainingRef.current = false;
    releaseAudio();
    setIsSpeaking(false);
  }, [releaseAudio]);

  const reset = useCallback(() => {
    generationRef.current++;
    queueRef.current = [];
    pendingTextRef.current = [];
    endedRef.current = false;
    drainingRef.current = false;
    spokenAnythingRef.current = false;
    allTextRef.current = '';
    inflightRef.current = 0;
    releaseAudio();
    setIsSpeaking(false);
  }, [releaseAudio]);

  return { isSpeaking, enqueue, end, stop, reset };
}
