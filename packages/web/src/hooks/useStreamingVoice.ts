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
   * 음성을 **한 번도 들려주지 못했을 때만** 호출된다.
   *
   * 청크 하나가 실패해도 나머지가 재생되면 사용자에겐 문제가 아니다.
   * 그래서 실패를 즉시 알리지 않고 모아뒀다가, 재생이 전부 실패한 경우에만 보고한다.
   * (즉시 알리면 소리는 잘 나오는데 경고가 뜨는 모순이 생긴다)
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
  /** 실제로 소리가 난 적이 있는지. 합성은 됐는데 재생이 막히는 경우를 구분한다. */
  const playedAnythingRef = useRef(false);
  /** 마지막 실패 사유. 끝까지 소리가 안 났을 때만 보고한다. */
  const lastErrorRef = useRef<string | null>(null);
  /** 지연 측정 — 어느 구간에서 시간을 쓰는지 콘솔로 확인하기 위한 것 */
  const t0Ref = useRef(0);
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

  /**
   * 재생을 멈춘다.
   *
   * ⚠️ removeAttribute('src') + load() 를 부르면 안 된다.
   *    src 없이 load()하면 미디어 엘리먼트가 MEDIA_ERR_SRC_NOT_SUPPORTED 상태로 들어가고,
   *    그 뒤 새 src를 넣어도 play()가 NotSupportedError로 거부된다.
   *    실제로 "오디오 형식을 재생할 수 없습니다"가 반복된 원인이 이것이었다.
   *    다음 재생은 src를 갈아끼우는 것으로 충분하다 — 비우지 않는다.
   */
  const releaseAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try { audio.pause(); } catch { /* ignore */ }
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
      const reqAt = performance.now();
      const blob = synthesize({ text, voice: optsRef.current.voice, maxChars: optsRef.current.maxChars })
        .then((r) => {
          if (seq === 0) {
            console.info(`[voice] 2) 첫 청크 합성 완료 — ${String(Math.round(performance.now() - reqAt))}ms (서버 왕복)`);
          }
          return r.audioBlob;
        })
        .catch((err: unknown) => {
          const status = (err as { status?: number })?.status;
          const msg = err instanceof Error ? err.message : String(err);
          console.warn('[streaming-voice] 청크 합성 실패:', msg);
          lastErrorRef.current =
            status === 503 ? '음성 합성이 서버에 설정되지 않았습니다 (OPENAI_API_KEY 확인 필요)'
            : status === 502 ? `음성 서비스 오류: ${msg}`
            : status === 401 ? '음성 요청 인증 실패 — 다시 로그인해 주세요'
            : `음성 합성 실패: ${msg}`;
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

        let settled = false;
        const done = (): void => {
          if (settled) return;
          settled = true;
          resolve();
        };

        const attach = (audio: HTMLAudioElement): void => {
          audio.onended = done;
          audio.onerror = done;
          audio.src = url;
          audio.load(); // 새 src로 로드 (src를 비운 채 load하면 엘리먼트가 에러 상태가 된다)
        };

        // 즉시 알리지 않고 기록만 한다 — 뒤 문장이 재생되면 사용자에겐 문제가 아니다
        const reportFailure = (name: string): void => {
          lastErrorRef.current =
            name === 'NotAllowedError'
              ? '브라우저가 자동 재생을 차단했습니다. 화면을 한 번 누른 뒤 다시 시도해 주세요.'
              : name === 'NotSupportedError'
                ? `오디오를 재생할 수 없습니다 (${String(blob.size)}바이트 ${blob.type || '형식불명'})`
                : `오디오 재생 실패: ${name || 'unknown'}`;
        };

        const reused = getAudioElement();
        attach(reused);

        reused.play().then(
          () => {
            if (!playedAnythingRef.current && t0Ref.current > 0) {
              console.info(`[voice] 3) 첫 소리 재생 — 문장 확보 후 총 ${String(Math.round(performance.now() - t0Ref.current))}ms`);
            }
            playedAnythingRef.current = true; setIsSpeaking(true);
          },
          (err: unknown) => {
            const name = (err as { name?: string })?.name ?? '';
            console.warn('[streaming-voice] 재생 실패:', name);
            // 재사용 엘리먼트가 이전 오류 상태에 갇혔을 수 있다 — 새 엘리먼트로 한 번만 재시도한다.
            // 이래도 실패하면 데이터 문제이므로 크기·형식을 실어 사유를 남긴다.
            if (name !== 'NotSupportedError') { reportFailure(name); done(); return; }

            const fresh = new Audio();
            fresh.preload = 'auto';
            audioRef.current = fresh;
            attach(fresh);
            fresh.play().then(
              () => { playedAnythingRef.current = true; setIsSpeaking(true); },
              (err2: unknown) => {
                const name2 = (err2 as { name?: string })?.name ?? '';
                console.warn('[streaming-voice] 재시도도 실패:', name2);
                reportFailure(name2);
                done();
              },
            );
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
        // 합성이 됐는지가 아니라 "실제로 소리가 났는지"로 판정한다.
        // 재생이 전부 막힌 경우(NotSupportedError 등)에도 브라우저 음성으로 폴백해야
        // 사용자가 완전한 무음을 겪지 않는다.
        if (!playedAnythingRef.current && allTextRef.current.trim()) {
          // 한 번도 못 들려줬을 때만 사유를 알린다
          if (lastErrorRef.current) optsRef.current.onError?.(lastErrorRef.current);
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
    if (t0Ref.current === 0) {
      t0Ref.current = performance.now();
      console.info('[voice] 1) 첫 문장 확보 — 합성 요청 시작:', trimmed.slice(0, 30));
    }
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
    playedAnythingRef.current = false;
    lastErrorRef.current = null;
    t0Ref.current = 0;
    allTextRef.current = '';
    inflightRef.current = 0;
    releaseAudio();
    setIsSpeaking(false);
  }, [releaseAudio]);

  return { isSpeaking, enqueue, end, stop, reset };
}
