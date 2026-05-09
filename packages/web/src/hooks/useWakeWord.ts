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

// 답변 중지 키워드 — 사용자가 응답을 끊고 싶을 때
const DEFAULT_INTERRUPT_PATTERNS: readonly RegExp[] = [
  /조용히\s*해/,
  /조용히/,
  /그만\s*해/,
  /그만/,
  /멈춰/,
  /닥쳐/,
  /\bstop\b/i,
  /shut\s*up/i,
  /be\s*quiet/i,
];

function matchesWakeWord(text: string): boolean {
  const cleaned = text.trim().toLowerCase();
  return WAKE_PATTERNS.some((re) => re.test(cleaned));
}

function matchesInterrupt(text: string, extraPatterns?: readonly RegExp[]): boolean {
  const cleaned = text.trim().toLowerCase();
  if (DEFAULT_INTERRUPT_PATTERNS.some((re) => re.test(cleaned))) return true;
  if (extraPatterns && extraPatterns.some((re) => re.test(cleaned))) return true;
  return false;
}

interface UseWakeWordOptions {
  readonly enabled: boolean;
  readonly onWake: (heardText: string) => void;
  /** 사용자가 "조용히 해", "그만", "stop" 등 발화 시 — 답변 끊기 등에 사용 */
  readonly onInterrupt?: (heardText: string) => void;
  readonly extraInterruptPatterns?: readonly RegExp[];
  readonly lang?: string;
}

interface UseWakeWordResult {
  readonly listening: boolean;
  readonly supported: boolean;
  /** iOS Safari/Chrome에서는 SpeechRecognition continuous가 사실상 불가 — wake word가 작동하지 않음 */
  readonly platformLimitation: 'ios' | null;
  readonly resume: () => void;
  readonly pause: () => void;
}

// iOS는 WebKit 기반 (Safari, Chrome iOS, Edge iOS 모두) — SpeechRecognition continuous 미지원에 가까움
function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ 는 platform이 MacIntel + 멀티터치
  if (navigator.platform === 'MacIntel' && (navigator as { maxTouchPoints?: number }).maxTouchPoints && (navigator as { maxTouchPoints: number }).maxTouchPoints > 1) return true;
  return false;
}

export function useWakeWord({
  enabled,
  onWake,
  onInterrupt,
  extraInterruptPatterns,
  lang = 'ko-KR',
}: UseWakeWordOptions): UseWakeWordResult {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onWakeRef = useRef(onWake);
  const onInterruptRef = useRef(onInterrupt);
  const extraPatternsRef = useRef(extraInterruptPatterns);
  const enabledRef = useRef(enabled);
  const restartTimeoutRef = useRef<number | null>(null);

  // ref 업데이트
  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);
  useEffect(() => {
    onInterruptRef.current = onInterrupt;
  }, [onInterrupt]);
  useEffect(() => {
    extraPatternsRef.current = extraInterruptPatterns;
  }, [extraInterruptPatterns]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const isIOS = detectIOS();
  const platformLimitation: 'ios' | null = isIOS ? 'ios' : null;
  // iOS는 WebKit이 SpeechRecognition continuous를 사실상 지원하지 않으므로 supported=false
  const supported = !isIOS && typeof window !== 'undefined' &&
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
      const now = Date.now();
      if (now - lastFiredAt < COOLDOWN_MS) return;

      // wake가 우선 (사용자가 "팅커벨"이라고 부르면 답변 중이라도 끊고 새 질문 모드)
      if (matchesWakeWord(text)) {
        lastFiredAt = now;
        try { recognition.stop(); } catch { /* ignore */ }
        onWakeRef.current(text);
        return;
      }

      // interrupt 키워드 — 답변 중지만 (재시작은 하지 않음, recognition은 계속 청취)
      if (onInterruptRef.current && matchesInterrupt(text, extraPatternsRef.current)) {
        lastFiredAt = now;
        onInterruptRef.current(text);
        // recognition은 정지하지 않음 — 사용자가 곧바로 새 명령 줄 수 있도록 청취 유지
        return;
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

  // 탭 백그라운드 시 wake recognition 일시 정지, 복귀 시 재개
  // (배터리·CPU 절약 + 모바일 백그라운드 마이크 권한 회피)
  useEffect(() => {
    if (!supported) return;
    const onVis = () => {
      if (document.hidden) {
        stopRecognition();
      } else if (enabledRef.current) {
        startRecognition();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [supported, startRecognition, stopRecognition]);

  const resume = useCallback(() => {
    if (enabledRef.current) {
      startRecognition();
    }
  }, [startRecognition]);

  const pause = useCallback(() => {
    stopRecognition();
  }, [stopRecognition]);

  return { listening, supported, platformLimitation, resume, pause };
}
