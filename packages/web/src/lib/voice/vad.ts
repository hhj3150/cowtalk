// VAD (Voice Activity Detection) — 말이 끝나면 녹음을 스스로 멈춘다.
//
// 왜 필요한가:
//   iOS 경로는 지금 6초 고정 녹음이다. 짧게 물으면 6초를 멍하니 기다리고,
//   길게 설명하면 중간에 잘린다. 착유장에서 손이 젖어 있는 사람에게 최악의 조합이다.
//
// 방식:
//   Web Audio AnalyserMode로 실시간 RMS를 재고,
//   (1) 주변 소음 바닥을 첫 300ms 동안 측정해 임계값을 적응시킨다 — 착유기·환풍기 소음 대응
//   (2) 발화가 시작된 뒤 지정 시간만큼 조용하면 종료를 알린다
//   (3) 아무 말도 없으면 noSpeechMs 후 종료 (마이크만 켜둔 채 방치 방지)
//   (4) 어떤 경우에도 maxMs를 넘기지 않는다
//
// onLevel로 흘려보내는 0~1 레벨은 UI 파형에 그대로 쓴다 — "듣고 있다"는 시각 피드백.

export interface VadOptions {
  /** 발화 후 이만큼 조용하면 종료 (기본 1200ms) */
  readonly silenceMs?: number;
  /** 발화가 한 번도 없으면 이 시간 후 종료 (기본 6000ms) */
  readonly noSpeechMs?: number;
  /** 발화 여부와 무관한 최대 녹음 시간 (기본 30000ms) */
  readonly maxMs?: number;
  /** 소음 바닥 대비 배수 — 이 값을 넘으면 발화로 본다 (기본 2.5) */
  readonly thresholdMultiplier?: number;
  /** 소음 바닥의 하한 — 완전 무음 환경에서 임계값이 0에 붙는 것을 막는다 */
  readonly minThreshold?: number;

  readonly onSpeechStart?: () => void;
  /** 종료 사유와 함께 호출된다. 호출자는 여기서 recorder.stop() 한다. */
  readonly onSilence?: (reason: VadStopReason) => void;
  /** 0~1 정규화 레벨 — UI 파형용 (약 60fps) */
  readonly onLevel?: (level: number) => void;
}

export type VadStopReason = 'silence' | 'no-speech' | 'max-duration';

export interface VadHandle {
  /** 감시 종료 + AudioContext 정리. 여러 번 호출해도 안전. */
  readonly stop: () => void;
  /** 발화가 감지된 적 있는지 — "아무 말도 안 하셨어요" 안내 분기에 쓴다 */
  readonly hasSpeech: () => boolean;
}

const DEFAULTS = {
  silenceMs: 1200,
  noSpeechMs: 6000,
  maxMs: 30_000,
  thresholdMultiplier: 2.5,
  minThreshold: 0.012,
} as const;

/** 소음 바닥 측정 구간 — 이 동안은 발화 판정을 하지 않는다 */
const CALIBRATION_MS = 300;

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext
    ?? (window as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
    ?? null;
}

/**
 * MediaStream을 감시해 발화 종료를 알린다.
 * Web Audio를 못 쓰는 환경에서는 maxMs 타이머만 걸고 조용히 성능 저하(graceful degradation)한다.
 */
export function createVad(stream: MediaStream, options: VadOptions = {}): VadHandle {
  const silenceMs = options.silenceMs ?? DEFAULTS.silenceMs;
  const noSpeechMs = options.noSpeechMs ?? DEFAULTS.noSpeechMs;
  const maxMs = options.maxMs ?? DEFAULTS.maxMs;
  const multiplier = options.thresholdMultiplier ?? DEFAULTS.thresholdMultiplier;
  const minThreshold = options.minThreshold ?? DEFAULTS.minThreshold;

  let stopped = false;
  let speechDetected = false;
  let intervalId: number | null = null;
  let ctx: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;

  const startedAt = Date.now();
  let lastLoudAt = 0;

  // 소음 바닥 추정 — 캘리브레이션 구간의 RMS 이동 평균
  let noiseFloor = 0;
  let calibrationSamples = 0;

  const finish = (reason: VadStopReason): void => {
    if (stopped) return;
    stop();
    options.onSilence?.(reason);
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
    try { source?.disconnect(); } catch { /* ignore */ }
    // close()는 Promise지만 실패해도 할 게 없다 — 페이지 이탈 시 GC가 정리한다
    void ctx?.close().catch(() => { /* ignore */ });
    ctx = null;
    source = null;
  };

  const AC = getAudioContextCtor();
  if (!AC) {
    // Web Audio 미지원 — 최대 시간 안전망만 건다
    const timer = window.setTimeout(() => finish('max-duration'), maxMs);
    return {
      stop: () => { window.clearTimeout(timer); stop(); },
      hasSpeech: () => false,
    };
  }

  try {
    ctx = new AC();
    source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);

    const data = new Float32Array(analyser.fftSize);

    // requestAnimationFrame은 탭이 백그라운드로 가면 멈춘다 → 최대 시간 안전망이 죽는다.
    // setInterval은 백그라운드에서 느려질 뿐 계속 돌므로 녹음이 영원히 안 끝나는 사고를 막는다.
    const TICK_MS = 50;

    const tick = (): void => {
      if (stopped || !ctx) return;

      analyser.getFloatTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i] ?? 0;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / data.length);

      const elapsed = Date.now() - startedAt;

      // UI 레벨 — 목소리 대역을 눈에 보이게 살짝 부스트
      options.onLevel?.(Math.min(1, rms * 8));

      // (1) 캘리브레이션: 주변 소음 바닥 측정
      if (elapsed < CALIBRATION_MS) {
        calibrationSamples++;
        noiseFloor += (rms - noiseFloor) / calibrationSamples;
        return;
      }

      const threshold = Math.max(noiseFloor * multiplier, minThreshold);

      if (rms > threshold) {
        lastLoudAt = Date.now();
        if (!speechDetected) {
          speechDetected = true;
          options.onSpeechStart?.();
        }
      }

      // (2) 발화 후 무음 → 종료
      if (speechDetected && lastLoudAt > 0 && Date.now() - lastLoudAt > silenceMs) {
        finish('silence');
        return;
      }

      // (3) 아예 말이 없음 → 종료
      if (!speechDetected && elapsed > noSpeechMs) {
        finish('no-speech');
        return;
      }

      // (4) 최대 시간
      if (elapsed > maxMs) {
        finish('max-duration');
      }
    };

    intervalId = window.setInterval(tick, TICK_MS);
  } catch {
    // AudioContext 생성 실패(권한·자동재생 정책 등) — 타이머 안전망으로 대체
    stop();
    const timer = window.setTimeout(() => options.onSilence?.('max-duration'), maxMs);
    return {
      stop: () => { window.clearTimeout(timer); },
      hasSpeech: () => false,
    };
  }

  return {
    stop,
    hasSpeech: () => speechDetected,
  };
}
