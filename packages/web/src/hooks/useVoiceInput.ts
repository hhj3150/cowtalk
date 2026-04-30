// 음성 입력 훅 — Web Speech API 한국어 음성 인식
// 사용처: InlineAiChat, AlarmLabelChatModal, TinkerbellAssistant, VoiceInput
//
// 설계 원칙:
// 1) 실패 시 사용자에게 이유를 알려준다 (현장에서 "왜 안 되지?" 가 가장 큰 좌절)
// 2) 권한 거부 상태를 사전 감지해서 불필요한 start() 호출을 피한다
// 3) 권한이 미요청 상태면 getUserMedia로 먼저 권한을 얻는다
// 4) HTTPS 아님/브라우저 미지원/네트워크 실패 등 SpeechRecognitionErrorEvent
//    의 모든 error 값을 한국어 메시지로 매핑한다

import { useState, useRef, useCallback, useEffect } from 'react';
import { useT } from '@web/i18n/useT';

export type VoiceErrorCode =
  | 'not-supported'       // Web Speech API 미지원 (Firefox, 일부 모바일)
  | 'not-secure'          // HTTPS 아님 (localhost 예외 제외)
  | 'permission-denied'   // 사용자가 마이크 권한 거부
  | 'no-speech'           // 아무 말도 감지 못 함
  | 'audio-capture'       // 마이크 장치 없음/접근 불가
  | 'network'             // 구글 음성 서버 통신 실패
  | 'aborted'             // 사용자가 취소
  | 'language-not-supported'
  | 'unknown';

export interface VoiceError {
  readonly code: VoiceErrorCode;
  readonly message: string;
}

export interface StartListeningOptions {
  /** STT BCP-47 언어 태그. 미지정 시 navigator.language → 5개 언어 매핑. */
  readonly lang?: string;
}

export interface UseVoiceInputReturn {
  readonly isListening: boolean;
  readonly transcript: string;
  readonly isSupported: boolean;
  readonly error: VoiceError | null;
  readonly startListening: (options?: StartListeningOptions) => Promise<void>;
  readonly stopListening: () => void;
  readonly dismissError: () => void;
}

/** 브라우저 언어 → STT BCP-47 매핑 (5개 언어 + 기본 ko-KR) */
function detectSttLang(): string {
  if (typeof navigator === 'undefined') return 'ko-KR';
  const raw = (navigator.language || 'ko').toLowerCase();
  if (raw.startsWith('ko')) return 'ko-KR';
  if (raw.startsWith('en')) return 'en-US';
  if (raw.startsWith('uz')) return 'uz-UZ';
  if (raw.startsWith('ru')) return 'ru-RU';
  if (raw.startsWith('mn')) return 'mn-MN';
  return 'ko-KR';
}

const ERROR_KEY: Readonly<Record<VoiceErrorCode, string>> = {
  'not-supported': 'voice.err.not_supported',
  'not-secure': 'voice.err.not_secure',
  'permission-denied': 'voice.err.permission_denied',
  'no-speech': 'voice.err.no_speech',
  'audio-capture': 'voice.err.audio_capture',
  'network': 'voice.err.network',
  'aborted': 'voice.err.aborted',
  'language-not-supported': 'voice.err.lang_not_supported',
  'unknown': 'voice.err.unknown',
};

function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  // localhost / 127.0.0.1 / ::1 은 Chrome에서 예외적으로 허용됨
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
}

export function useVoiceInput(onResult: (text: string) => void): UseVoiceInputReturn {
  const t = useT();
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<VoiceError | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptRef = useRef('');
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // 언마운트 시 recognition 정리
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
    };
  }, []);

  const raiseError = useCallback((code: VoiceErrorCode) => {
    setError({ code, message: t(ERROR_KEY[code]) });
    setIsListening(false);
    setTranscript('');
    transcriptRef.current = '';
  }, [t]);

  const dismissError = useCallback(() => setError(null), []);

  const startListening = useCallback(async (options?: StartListeningOptions) => {
    setError(null);

    if (!isSupported) {
      raiseError('not-supported');
      return;
    }
    if (!isSecureContext()) {
      raiseError('not-secure');
      return;
    }
    const sttLang = options?.lang ?? detectSttLang();

    // 1) 권한 상태 사전 확인. denied면 즉시 안내, prompt면 getUserMedia로 먼저 권한 획득
    try {
      const permissionApi = (navigator as { permissions?: { query: (p: { name: PermissionName }) => Promise<PermissionStatus> } }).permissions;
      if (permissionApi?.query) {
        const status = await permissionApi.query({ name: 'microphone' as PermissionName });
        if (status.state === 'denied') {
          raiseError('permission-denied');
          return;
        }
      }
    } catch {
      // permissions API 없거나 microphone 쿼리 미지원 — 무시하고 진행
    }

    // 2) getUserMedia로 권한 요청 (아직 prompt 상태였다면 여기서 팝업이 뜸)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 스트림은 바로 닫아도 권한은 유지됨
      for (const track of stream.getTracks()) track.stop();
    } catch (err) {
      const name = (err as { name?: string })?.name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        raiseError('permission-denied');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        raiseError('audio-capture');
      } else {
        raiseError('unknown');
      }
      return;
    }

    // 3) SpeechRecognition 시작
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      raiseError('not-supported');
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.lang = sttLang;
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript('');
      transcriptRef.current = '';
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let finalText = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result && result[0]) {
          if (result.isFinal) {
            finalText += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
      }
      const text = finalText || interim;
      setTranscript(text);
      transcriptRef.current = text;
    };

    recognition.onend = () => {
      setIsListening(false);
      const finalText = transcriptRef.current.trim();
      if (finalText) {
        onResultRef.current(finalText);
      }
      transcriptRef.current = '';
      setTranscript('');
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const errCode: VoiceErrorCode = (() => {
        switch (event.error) {
          case 'not-allowed':
          case 'service-not-allowed':
            return 'permission-denied';
          case 'no-speech':
            return 'no-speech';
          case 'audio-capture':
            return 'audio-capture';
          case 'network':
            return 'network';
          case 'aborted':
            return 'aborted';
          case 'language-not-supported':
            return 'language-not-supported';
          default:
            return 'unknown';
        }
      })();
      // aborted는 조용히 처리 (사용자 취소)
      if (errCode === 'aborted') {
        setIsListening(false);
        setTranscript('');
        transcriptRef.current = '';
        return;
      }
      raiseError(errCode);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      // 이미 start된 상태에서 재시작하면 InvalidStateError
      const name = (err as { name?: string })?.name ?? '';
      if (name === 'InvalidStateError') {
        try {
          recognition.stop();
        } catch {
          // ignore
        }
      } else {
        raiseError('unknown');
      }
    }
  }, [isSupported, raiseError]);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
  }, []);

  return { isListening, transcript, isSupported, error, startListening, stopListening, dismissError };
}
