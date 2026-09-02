// 마이크 음량 감시 — 무음 자동 종료와 barge-in 의 공통 토대.
//
// 왜 Web Audio 인가: MediaRecorder 는 "지금 소리가 나는지"를 알려주지 않는다.
// 같은 스트림에 AnalyserNode 를 물려 RMS 를 재면 말이 끝났는지, 사용자가
// 끼어들었는지를 판단할 수 있다. 무거운 VAD 모델 없이 현장에서 충분히 쓸 만하다.
//
// 축사 소음 대응: 절대 임계값을 쓰면 목장마다 다르게 동작한다.
// 시작 직후 잠깐의 배경 소음을 재서 **바닥 기준(noise floor)** 을 잡고,
// 그 위로 얼마나 튀는지로 발화를 판단한다.

export interface MicActivityOptions {
  /** 발화로 볼 배수 — 바닥 대비 이 배 이상이면 말하는 중 */
  readonly speechRatio?: number;
  /** 이만큼 조용하면 발화 종료로 본다 (ms) */
  readonly silenceMs?: number;
  /** 바닥 기준을 재는 시간 (ms) */
  readonly calibrateMs?: number;
}

export interface MicActivityHandle {
  /** 발화가 감지되면 호출 (barge-in 판단용) */
  onSpeech?: () => void;
  /** 발화 후 silenceMs 동안 조용하면 호출 (자동 종료용) */
  onSilence?: () => void;
  stop: () => void;
}

const DEFAULTS = { speechRatio: 2.6, silenceMs: 900, calibrateMs: 350 };

/**
 * 스트림에 음량 감시를 붙인다. 반환된 핸들의 stop() 으로 정리한다.
 *
 * onSilence 는 **한 번이라도 발화가 감지된 뒤에만** 울린다.
 * 그렇지 않으면 사용자가 말을 시작하기도 전에 녹음이 끊긴다.
 */
export function attachMicActivity(
  stream: MediaStream,
  handlers: { onSpeech?: () => void; onSilence?: () => void },
  opts: MicActivityOptions = {},
): MicActivityHandle {
  const { speechRatio, silenceMs, calibrateMs } = { ...DEFAULTS, ...opts };

  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;
  src.connect(analyser);

  const buf = new Float32Array(analyser.fftSize);
  const startedAt = performance.now();
  let floor = 0.004;      // 합리적 초기값 — 보정 전에도 아주 조용하진 않다
  let floorSamples = 0;
  let sawSpeech = false;
  let lastLoudAt = 0;
  let raf = 0;
  let stopped = false;

  const rms = (): number => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!;
    return Math.sqrt(sum / buf.length);
  };

  const tick = (): void => {
    if (stopped) return;
    const now = performance.now();
    const level = rms();

    // 초반 구간은 배경 소음 측정에 쓴다
    if (now - startedAt < calibrateMs) {
      floor = floorSamples === 0 ? level : (floor * floorSamples + level) / (floorSamples + 1);
      floorSamples++;
      raf = requestAnimationFrame(tick);
      return;
    }

    const speaking = level > Math.max(floor * speechRatio, 0.008);
    if (speaking) {
      lastLoudAt = now;
      if (!sawSpeech) {
        sawSpeech = true;
        handlers.onSpeech?.();
      }
    } else if (sawSpeech && lastLoudAt > 0 && now - lastLoudAt > silenceMs) {
      handlers.onSilence?.();
      return; // 한 번만 알린다
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      try { src.disconnect(); } catch { /* 이미 끊김 */ }
      void ctx.close().catch(() => undefined);
    },
  };
}
