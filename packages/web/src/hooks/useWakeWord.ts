// Wake Word "팅커벨" — Siri/Alexa 스타일 상시 청취
//
// 사용자가 "팅커벨"이라 부르면 onWake 콜백이 호출됩니다.
// 콜백에서 본격 음성 입력 모드로 전환하면 자연스러운 호출 → 대화가 됩니다.
//
// 원칙:
// - 마이크는 wake 청취와 본격 입력이 동시에 점유하지 않음
// - onWake 호출 시 wake recognition 자동 정지 → 외부에서 resume() 호출하여 재개
// - 권한 거부·미지원 환경은 silent fallback (에러 없이 그냥 비활성)

import { useCallback, useEffect, useRef, useState } from 'react';

// 팅커벨 호명 변형 — 한국어 음성 인식이 다양한 표기로 들려줌
const WAKE_PATTERNS: readonly RegExp[] = [
  /팅커벨/,
  /팅커/,
  /tinker\s*bell/i,
  /tinkerbell/i,
  // 자주 잘못 듣는 변형
  /딩커벨/,
  /칭커벨/,
];

function matchesWakeWord(text: string): boolean {
  const cleaned = text.trim().toLowerCase();
  return WAKE_PATTERNS.some((re) => re.test(cleaned));
}

interface UseWakeWordOptions {
  readonly enabled: boolean;
  readonly onWake: (heardText: string) => void;
  readonly lang?: string;
}

interface UseWakeWordResult {
  readonly listening: boolean;
  readonly supported: boolean;
  readonly resume: () => void;
  readonly pause: () => void;
}

export function useWakeWord({ enabled, onWake, lang = 'ko-KR' }: UseWakeWordOptions): UseWakeWordResult {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onWakeRef = useRef(onWake);
  const enabledRef = useRef(enabled);
  const restartTimeoutRef = useRef<number | null>(null);

  // ref 업데이트
  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const supported = typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const stopRecognition = useCallback(() => {
    if (restartTimeoutRef.current !== null) {
      window.clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.onstart = null;
        rec.onend = null;
        rec.onerror = null;
        rec.onresult = null;
        rec.stop();
      } catch {
        // 이미 정지됐을 수 있음
      }
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  const startRecognition = useCallback(() => {
    if (!supported || !enabledRef.current) return;
    if (recognitionRef.current) return; // 이미 실행 중

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    let lastFiredAt = 0;
    const COOLDOWN_MS = 2000; // 같은 발화로 wake 두 번 fire 방지

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // 마지막 인식 결과만 검사 (interim 포함)
      const lastIdx = event.results.length - 1;
      const lastResult = event.results[lastIdx];
      if (!lastResult || !lastResult[0]) return;
      const text = lastResult[0].transcript;

      if (matchesWakeWord(text)) {
        const now = Date.now();
        if (now - lastFiredAt < COOLDOWN_MS) return;
        lastFiredAt = now;

        // wake 감지 → recognition 정지하고 콜백 호출
        try {
          recognition.stop();
        } catch {
          // 무시
        }
        onWakeRef.current(text);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech', 'audio-capture', 'aborted' 등은 무해 — 자동 재시작
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        // 권한 거부 — 재시작하지 않음
        recognitionRef.current = null;
        setListening(false);
        return;
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      // 활성 상태면 자동 재시작 (continuous는 일정 시간 지나면 자동 종료됨)
      if (enabledRef.current) {
        restartTimeoutRef.current = window.setTimeout(() => {
          restartTimeoutRef.current = null;
          startRecognition();
        }, 500);
      }
    };

    recognition.onstart = () => {
      setListening(true);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      // 이미 시작된 상태일 수 있음 — 무시
      recognitionRef.current = null;
    }
  }, [supported, lang]);

  // enabled 토글에 따라 시작/정지
  useEffect(() => {
    if (enabled && supported) {
      startRecognition();
    } else {
      stopRecognition();
    }
    return () => {
      stopRecognition();
    };
  }, [enabled, supported, startRecognition, stopRecognition]);

  const resume = useCallback(() => {
    if (enabledRef.current) {
      startRecognition();
    }
  }, [startRecognition]);

  const pause = useCallback(() => {
    stopRecognition();
  }, [stopRecognition]);

  return { listening, supported, resume, pause };
}
