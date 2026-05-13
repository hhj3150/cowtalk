// 음성 출력 훅 — 텍스트 → OpenAI TTS → 브라우저 오디오 재생
//
// 설계 원칙:
// 1) 사용자가 명시적으로 voiceMode를 ON 했을 때만 자동 재생
// 2) 재생 중 다음 응답이 오면 이전 오디오 정리 (메모리 누수 방지)
// 3) 503(서비스 미설정) → 조용히 실패. 사용자에게 부담 안 줌
// 4) 모바일 자동재생 정책 회피: 첫 사용자 인터랙션 후에만 재생

import { useCallback, useEffect, useRef, useState } from 'react';
import { speak, type TtsVoice } from '@web/api/audio.api';

export type VoiceOutputErrorCode =
  | 'not-configured'  // 서버에 OPENAI_API_KEY 미설정
  | 'upstream-error'  // OpenAI 일시 장애
  | 'autoplay-blocked' // 브라우저가 자동재생 차단
  | 'quota-exceeded'  // 사용자별 일/월 TTS 한도 초과
  | 'unknown';

export interface VoiceOutputError {
  readonly code: VoiceOutputErrorCode;
  readonly message: string;
}

export interface UseVoiceOutputReturn {
  readonly isPlaying: boolean;
  readonly isSynthesizing: boolean;
  readonly error: VoiceOutputError | null;
  readonly voiceMode: boolean;
  readonly toggleVoiceMode: () => void;
  readonly speakText: (text: string) => Promise<void>;
  readonly stopSpeaking: () => void;
  readonly dismissError: () => void;
}

interface UseVoiceOutputOptions {
  readonly voice?: TtsVoice;
  readonly maxChars?: number;
  readonly initialVoiceMode?: boolean;
  readonly storageKey?: string; // localStorage에 voiceMode 저장 키
}

const DEFAULT_STORAGE_KEY = 'cowtalk:voice-mode';

function loadVoiceMode(storageKey: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = localStorage.getItem(storageKey);
    return v === '1' ? true : v === '0' ? false : fallback;
  } catch {
    return fallback;
  }
}

function saveVoiceMode(storageKey: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey, value ? '1' : '0');
  } catch {
    // ignore
  }
}

export function useVoiceOutput(options: UseVoiceOutputOptions = {}): UseVoiceOutputReturn {
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
  const [voiceMode, setVoiceMode] = useState(() =>
    loadVoiceMode(storageKey, options.initialVoiceMode ?? false),
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [error, setError] = useState<VoiceOutputError | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  // 재생 시작 → 완전 종료까지 보장하기 위한 promise resolver.
  // 피드백 루프 방지: STT/wake word는 isPlaying === false 일 때만 활성화되어야 한다.
  // audio.play()는 재생 시작 시 resolve하므로, 호출자가 "발화 끝났는지"를 알려면
  // onended까지 기다려야 한다 (또는 cleanup/오류로 강제 종료).
  const endResolverRef = useRef<(() => void) | null>(null);

  // 언마운트 시 audio 정리
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const cleanup = useCallback(() => {
    const hadAudio = audioRef.current !== null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    // pause()는 onended를 fire하지 않으므로 isPlaying을 직접 정리.
    // 안 하면 barge-in 후 isPlaying이 true로 남아 wake word가 영구 차단됨.
    if (hadAudio) setIsPlaying(false);
    // 진행 중인 speakText() 호출자를 즉시 깨움 — 끊긴 발화도 await가 풀려야 다음 흐름 진행.
    if (endResolverRef.current) {
      const resolve = endResolverRef.current;
      endResolverRef.current = null;
      resolve();
    }
  }, []);

  const toggleVoiceMode = useCallback(() => {
    setVoiceMode((prev) => {
      const next = !prev;
      saveVoiceMode(storageKey, next);
      // OFF 시 즉시 정리
      if (!next) cleanup();
      return next;
    });
  }, [storageKey, cleanup]);

  const stopSpeaking = useCallback(() => {
    cleanup();
    setIsPlaying(false);
  }, [cleanup]);

  const dismissError = useCallback(() => setError(null), []);

  const speakText = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // 진행 중인 재생 정리
      cleanup();
      setError(null);
      setIsSynthesizing(true);

      // 에러를 state만 업데이트하지 않고 throw도 함 — 호출자가 .catch로 잡아 UI 노출 가능
      const raiseAndThrow = (voError: VoiceOutputError): never => {
        console.error('[useVoiceOutput]', voError.code, voError.message);
        setError(voError);
        throw Object.assign(new Error(voError.message), { code: voError.code });
      };

      try {
        let result;
        try {
          result = await speak({
            text: trimmed,
            voice: options.voice,
            maxChars: options.maxChars,
          });
        } catch (err) {
          const status = (err as { response?: { status?: number }; status?: number })?.response?.status
            ?? (err as { status?: number })?.status;
          if (status === 503) {
            raiseAndThrow({ code: 'not-configured', message: '음성 기능이 아직 활성화되지 않았습니다 (Railway OPENAI_API_KEY 미설정)' });
          } else if (status === 429) {
            const body = (err as { response?: { data?: { error?: { message?: string; limitType?: string } } } })?.response?.data?.error;
            const limit = body?.limitType === 'daily' ? '오늘' : '이번 달';
            raiseAndThrow({
              code: 'quota-exceeded',
              message: body?.message ?? `${limit} 음성 사용량 한도에 도달했습니다.`,
            });
          } else if (status === 502) {
            const body = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
            raiseAndThrow({ code: 'upstream-error', message: body ?? '음성 서비스 일시 장애' });
          } else if (status === 401) {
            raiseAndThrow({ code: 'upstream-error', message: 'TTS 인증 실패 (HTTP 401)' });
          } else {
            raiseAndThrow({
              code: 'unknown',
              message: `TTS 요청 실패: ${err instanceof Error ? err.message : String(err)}${status ? ` (HTTP ${String(status)})` : ''}`,
            });
          }
          throw err; // unreachable — raiseAndThrow는 throw함
        }

        const url = URL.createObjectURL(result.audioBlob);
        objectUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;

        // 재생 완전 종료까지 기다리는 promise. audio.play()는 재생 시작 시 resolve하므로
        // 여기서 별도 onended 시점에 resolve하여 호출자가 STT 재개 타이밍을 정확히 잡게 함.
        const endPromise = new Promise<void>((resolve) => {
          endResolverRef.current = resolve;
        });

        audio.onplay = () => setIsPlaying(true);
        audio.onended = () => {
          setIsPlaying(false);
          cleanup();
        };
        audio.onerror = () => {
          // 재생 오류 시에도 await가 영원히 걸리지 않도록 resolve
          setIsPlaying(false);
          cleanup();
        };

        try {
          await audio.play();
        } catch (playErr) {
          // play() 실패 시 endResolver 정리
          if (endResolverRef.current) {
            const r = endResolverRef.current;
            endResolverRef.current = null;
            r();
          }
          const name = (playErr as { name?: string })?.name ?? '';
          if (name === 'NotAllowedError') {
            raiseAndThrow({
              code: 'autoplay-blocked',
              message: '브라우저가 자동재생을 차단했습니다. 화면을 한 번 탭한 후 다시 시도하세요.',
            });
          } else {
            raiseAndThrow({ code: 'unknown', message: `오디오 재생 실패: ${name || 'unknown'}` });
          }
        }

        // 재생 시작 성공 → 실제 종료까지 await (피드백 루프 방지의 핵심)
        await endPromise;
        // 스피커 잔향(echo tail) — 200ms 추가 가드. 이 동안에도 isPlaying은 false이지만
        // 호출자(askTinkerbell)는 여기서 풀리므로 wake word 재개가 200ms 뒤에 일어남.
        await new Promise<void>((r) => setTimeout(r, 200));
      } finally {
        setIsSynthesizing(false);
      }
    },
    [options.voice, options.maxChars, cleanup],
  );

  return {
    isPlaying,
    isSynthesizing,
    error,
    voiceMode,
    toggleVoiceMode,
    speakText,
    stopSpeaking,
    dismissError,
  };
}
