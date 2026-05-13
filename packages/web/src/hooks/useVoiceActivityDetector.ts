// VAD (Voice Activity Detection) — 적응형 RMS 기반 침묵 감지 훅.
//
// 왜 ML(silero-vad) 대신 RMS인가:
// - ONNX 런타임 ~5MB + WASM은 한국 농촌 LTE에서 cold-start 5초+
// - silero-vad도 축사 소음(환기/착유)에서 완벽하지 않음
// - 적응형 baseline(첫 500ms로 noise floor 측정)이 농장 환경에 더 강함
// - 0 dependency, 모든 브라우저 즉시 동작
//
// 동작:
// 1) startStream(stream) — getUserMedia로 얻은 stream을 받아 AudioContext에 연결
// 2) 첫 calibrationMs(500ms) 동안 noise floor(RMS 평균)를 측정
// 3) threshold = noise floor × thresholdMultiplier(기본 2.5)
// 4) RMS > threshold → "speech 감지", 무음 타이머 reset
// 5) RMS ≤ threshold가 silenceMs(기본 1000ms) 이상 → onSilenceTimeout 호출
// 6) 최소 발화 시간(minSpeechMs, 기본 300ms) 미만이면 무시 (오탐 방지)

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseVoiceActivityDetectorOptions {
  /** 침묵 지속 시 호출 — 일반적으로 stopListening() 트리거. */
  readonly onSilenceTimeout: () => void;
  /** noise floor 측정 시간(ms). 기본 500. */
  readonly calibrationMs?: number;
  /** 침묵 판정 시간(ms). 기본 1000. */
  readonly silenceMs?: number;
  /** 최소 유효 발화 시간(ms). 미만이면 silence 트리거 무시. 기본 300. */
  readonly minSpeechMs?: number;
  /** threshold = noise floor × 이 값. 기본 2.5. */
  readonly thresholdMultiplier?: number;
  /** 절대 최소 threshold (조용한 환경에서 noise floor가 0에 가까운 경우 보호). 기본 0.005. */
  readonly minThreshold?: number;
  /** disabled 시 모든 처리 중단. */
  readonly disabled?: boolean;
}

export interface UseVoiceActivityDetectorReturn {
  /** stream을 받아 VAD 시작. 호출자가 같은 stream을 STT에도 사용. */
  readonly startStream: (stream: MediaStream) => void;
  /** VAD 중지 + 리소스 정리. */
  readonly stop: () => void;
  /** 0~1 정규화된 현재 음량 (시각 인디케이터용). */
  readonly volume: number;
  /** 현재 speech로 판정 중인가. */
  readonly isSpeaking: boolean;
  /** 보정(calibration) 완료 여부. */
  readonly calibrated: boolean;
}

export function useVoiceActivityDetector({
  onSilenceTimeout,
  calibrationMs = 500,
  silenceMs = 1000,
  minSpeechMs = 300,
  thresholdMultiplier = 2.5,
  minThreshold = 0.005,
  disabled = false,
}: UseVoiceActivityDetectorOptions): UseVoiceActivityDetectorReturn {
  const [volume, setVolume] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [calibrated, setCalibrated] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const onSilenceRef = useRef(onSilenceTimeout);
  const disabledRef = useRef(disabled);

  // 보정 + 상태 머신용
  const startedAtRef = useRef<number>(0);
  const calibrationSamplesRef = useRef<number[]>([]);
  const thresholdRef = useRef<number>(minThreshold);
  const lastSpeechAtRef = useRef<number>(0);
  const firstSpeechAtRef = useRef<number | null>(null);
  const firedRef = useRef<boolean>(false);

  useEffect(() => { onSilenceRef.current = onSilenceTimeout; }, [onSilenceTimeout]);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch { /* ignore */ }
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch { /* ignore */ }
      analyserRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      try { void audioCtxRef.current.close(); } catch { /* ignore */ }
      audioCtxRef.current = null;
    }
    setVolume(0);
    setIsSpeaking(false);
    setCalibrated(false);
    calibrationSamplesRef.current = [];
    thresholdRef.current = minThreshold;
    firstSpeechAtRef.current = null;
    firedRef.current = false;
  }, [minThreshold]);

  // 언마운트 시 정리
  useEffect(() => {
    return () => stop();
  }, [stop]);

  const startStream = useCallback((stream: MediaStream) => {
    if (disabledRef.current) return;
    // 이미 실행 중이면 정리
    stop();

    // AudioContext — iOS Safari는 webkitAudioContext 폴백
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;

    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.4;
    analyserRef.current = analyser;

    source.connect(analyser);

    const buffer = new Float32Array(analyser.fftSize);
    startedAtRef.current = performance.now();
    lastSpeechAtRef.current = startedAtRef.current;
    firstSpeechAtRef.current = null;
    calibrationSamplesRef.current = [];
    thresholdRef.current = minThreshold;
    firedRef.current = false;

    const loop = () => {
      if (!analyserRef.current || disabledRef.current) return;
      analyserRef.current.getFloatTimeDomainData(buffer);
      // RMS 계산
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = buffer[i]!;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buffer.length);
      const now = performance.now();
      const elapsed = now - startedAtRef.current;

      // 시각 인디케이터용 정규화 (대략 -40dB 이상을 1로)
      setVolume(Math.min(1, rms / 0.3));

      if (elapsed < calibrationMs) {
        // 보정 단계 — noise floor 샘플 수집
        calibrationSamplesRef.current.push(rms);
      } else {
        if (!calibrated) {
          const samples = calibrationSamplesRef.current;
          const avg = samples.length > 0
            ? samples.reduce((s, v) => s + v, 0) / samples.length
            : minThreshold;
          thresholdRef.current = Math.max(avg * thresholdMultiplier, minThreshold);
          setCalibrated(true);
        }

        const isSpeech = rms > thresholdRef.current;
        if (isSpeech) {
          lastSpeechAtRef.current = now;
          if (firstSpeechAtRef.current === null) firstSpeechAtRef.current = now;
          if (!isSpeaking) setIsSpeaking(true);
        } else {
          if (isSpeaking) setIsSpeaking(false);
          const silenceDuration = now - lastSpeechAtRef.current;
          const hasMinSpeech = firstSpeechAtRef.current !== null
            && (lastSpeechAtRef.current - firstSpeechAtRef.current) >= minSpeechMs;
          // 한 번만 fire (중복 호출 방지)
          if (!firedRef.current && hasMinSpeech && silenceDuration >= silenceMs) {
            firedRef.current = true;
            onSilenceRef.current();
            return; // 루프 종료 — 호출자가 stop()을 호출할 것
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [stop, calibrationMs, minSpeechMs, silenceMs, thresholdMultiplier, minThreshold, calibrated, isSpeaking]);

  return { startStream, stop, volume, isSpeaking, calibrated };
}
