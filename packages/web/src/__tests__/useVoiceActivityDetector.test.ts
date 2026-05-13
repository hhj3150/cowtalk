// useVoiceActivityDetector — 적응형 RMS VAD 회귀 테스트
//
// 검증 (Day 5-6 P0-F):
// 1) 보정 단계(calibrationMs) 후 calibrated=true 전환
// 2) speech(임계값 초과) → 침묵(silenceMs) 지속 시 onSilenceTimeout 호출
// 3) 최소 발화 시간(minSpeechMs) 미만이면 timeout 호출 안 함 (오탐 방지)
// 4) 같은 발화 세션에서 onSilenceTimeout은 1회만 호출 (중복 방지)
// 5) disabled / stop() 호출 시 콜백 발생 안 함

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceActivityDetector } from '@web/hooks/useVoiceActivityDetector';

// AudioContext 모킹 — fftSize/getFloatTimeDomainData를 외부에서 제어
interface MockAnalyser {
  fftSize: number;
  smoothingTimeConstant: number;
  rms: number; // 테스트에서 직접 설정 — 매 프레임 이 값 기반으로 buffer 생성
  connect: () => void;
  disconnect: () => void;
  getFloatTimeDomainData: (buffer: Float32Array) => void;
}

interface MockCtx {
  state: 'running' | 'closed';
  analyser: MockAnalyser;
  createMediaStreamSource: () => { connect: (n: MockAnalyser) => void; disconnect: () => void };
  createAnalyser: () => MockAnalyser;
  close: () => Promise<void>;
}

let currentAnalyser: MockAnalyser;

function setupAudioMock(): { setRms: (v: number) => void; cleanup: () => void } {
  const analyser: MockAnalyser = {
    fftSize: 1024,
    smoothingTimeConstant: 0.4,
    rms: 0,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getFloatTimeDomainData: (buffer: Float32Array) => {
      // RMS 목표값에 도달하는 사인 형태로 buffer 채움
      const amp = analyser.rms;
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = amp;
      }
    },
  };
  currentAnalyser = analyser;

  const ctx: MockCtx = {
    state: 'running',
    analyser,
    createMediaStreamSource: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
    createAnalyser: () => analyser,
    close: async () => { ctx.state = 'closed'; },
  };

  const Original = global.AudioContext;
  global.AudioContext = vi.fn(() => ctx) as unknown as typeof AudioContext;

  // requestAnimationFrame을 즉시 실행 큐로 — fake timers와 협업
  const origRaf = global.requestAnimationFrame;
  const origCaf = global.cancelAnimationFrame;
  let rafId = 0;
  const rafCbs = new Map<number, FrameRequestCallback>();
  global.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    rafId++;
    rafCbs.set(rafId, cb);
    // setTimeout 0으로 micro-defer — fake timer가 잡음
    setTimeout(() => {
      const c = rafCbs.get(rafId);
      if (c) {
        rafCbs.delete(rafId);
        c(performance.now());
      }
    }, 0);
    return rafId;
  }) as typeof requestAnimationFrame;
  global.cancelAnimationFrame = ((id: number) => { rafCbs.delete(id); }) as typeof cancelAnimationFrame;

  return {
    setRms: (v: number) => { analyser.rms = v; },
    cleanup: () => {
      global.AudioContext = Original;
      global.requestAnimationFrame = origRaf;
      global.cancelAnimationFrame = origCaf;
    },
  };
}

function makeFakeStream(): MediaStream {
  return { getTracks: () => [] } as unknown as MediaStream;
}

describe('useVoiceActivityDetector', () => {
  let mock: ReturnType<typeof setupAudioMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    mock = setupAudioMock();
  });
  afterEach(() => {
    mock.cleanup();
    vi.useRealTimers();
  });

  it('보정 완료 후 발화 + 침묵 시 onSilenceTimeout 호출', () => {
    const onSilenceTimeout = vi.fn();
    const { result } = renderHook(() =>
      useVoiceActivityDetector({
        onSilenceTimeout,
        calibrationMs: 200,
        silenceMs: 500,
        minSpeechMs: 100,
        thresholdMultiplier: 2.5,
        minThreshold: 0.01,
      })
    );

    // 보정 동안 noise floor = 0.005 (낮은 노이즈)
    act(() => {
      mock.setRms(0.005);
      result.current.startStream(makeFakeStream());
      vi.advanceTimersByTime(250); // 보정 + α
    });

    // 발화 — RMS 0.5 (threshold 0.0125 훨씬 초과)
    act(() => {
      mock.setRms(0.5);
      vi.advanceTimersByTime(200); // 최소 발화 충족
    });

    // 침묵 시작
    act(() => {
      mock.setRms(0.001);
      vi.advanceTimersByTime(600); // silenceMs 500 초과
    });

    expect(onSilenceTimeout).toHaveBeenCalledTimes(1);
  });

  it('최소 발화 시간 미만이면 onSilenceTimeout 호출 안 함', () => {
    const onSilenceTimeout = vi.fn();
    const { result } = renderHook(() =>
      useVoiceActivityDetector({
        onSilenceTimeout,
        calibrationMs: 200,
        silenceMs: 500,
        minSpeechMs: 500, // 큰 minSpeechMs
        thresholdMultiplier: 2.5,
        minThreshold: 0.01,
      })
    );

    act(() => {
      mock.setRms(0.005);
      result.current.startStream(makeFakeStream());
      vi.advanceTimersByTime(250);
    });

    // 짧은 발화 (200ms < minSpeechMs 500ms)
    act(() => {
      mock.setRms(0.5);
      vi.advanceTimersByTime(200);
    });
    // 긴 침묵
    act(() => {
      mock.setRms(0.001);
      vi.advanceTimersByTime(1000);
    });

    expect(onSilenceTimeout).not.toHaveBeenCalled();
  });

  it('onSilenceTimeout은 세션당 1회만 호출 (중복 방지)', () => {
    const onSilenceTimeout = vi.fn();
    const { result } = renderHook(() =>
      useVoiceActivityDetector({
        onSilenceTimeout,
        calibrationMs: 200,
        silenceMs: 300,
        minSpeechMs: 100,
        minThreshold: 0.01,
      })
    );

    act(() => {
      mock.setRms(0.005);
      result.current.startStream(makeFakeStream());
      vi.advanceTimersByTime(250);
    });
    act(() => {
      mock.setRms(0.5);
      vi.advanceTimersByTime(200);
    });
    act(() => {
      mock.setRms(0.001);
      vi.advanceTimersByTime(2000); // 한 번 fire 후 추가 시간 흘러도
    });

    expect(onSilenceTimeout).toHaveBeenCalledTimes(1);
  });

  it('stop() 호출 후엔 콜백 발생 안 함', () => {
    const onSilenceTimeout = vi.fn();
    const { result } = renderHook(() =>
      useVoiceActivityDetector({
        onSilenceTimeout,
        calibrationMs: 100,
        silenceMs: 300,
        minSpeechMs: 100,
        minThreshold: 0.01,
      })
    );

    act(() => {
      mock.setRms(0.005);
      result.current.startStream(makeFakeStream());
      vi.advanceTimersByTime(150);
    });
    act(() => {
      mock.setRms(0.5);
      vi.advanceTimersByTime(150);
    });

    // 침묵 도달 전에 stop
    act(() => {
      result.current.stop();
      mock.setRms(0.001);
      vi.advanceTimersByTime(1000);
    });

    expect(onSilenceTimeout).not.toHaveBeenCalled();
  });
});
