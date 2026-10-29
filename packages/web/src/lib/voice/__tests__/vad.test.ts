// VAD — iOS에서 AudioContext가 suspended로 시작해 분석기가 0만 읽을 때
// '말 없음'으로 오판해 녹음을 끊지 않는지 검증한다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createVad } from '../vad';

let level = 0;
const resume = vi.fn(() => Promise.resolve());

class FakeAudioContext {
  state = 'suspended';
  resume = resume;
  close = () => Promise.resolve();
  createMediaStreamSource() { return { connect: () => undefined, disconnect: () => undefined }; }
  createAnalyser() {
    return {
      fftSize: 0,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: (arr: Float32Array) => { arr.fill(level); },
    };
  }
}

describe('createVad', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    level = 0;
    resume.mockClear();
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('suspended 상태로 생성된 AudioContext를 resume 한다', () => {
    const vad = createVad({} as MediaStream);
    expect(resume).toHaveBeenCalledTimes(1);
    vad.stop();
  });

  it('신호가 전혀 없으면(분석기 정지) no-speech로 끊지 않고 최대 시간까지 녹음한다', () => {
    const onSilence = vi.fn();
    createVad({} as MediaStream, { noSpeechMs: 1000, maxMs: 5000, onSilence });
    vi.advanceTimersByTime(2000);
    expect(onSilence).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4000);
    expect(onSilence).toHaveBeenCalledWith('max-duration');
  });

  it('미세한 배경 신호만 있으면 기존대로 no-speech로 종료한다', () => {
    level = 0.0001;
    const onSilence = vi.fn();
    createVad({} as MediaStream, { noSpeechMs: 1000, maxMs: 5000, onSilence });
    vi.advanceTimersByTime(1500);
    expect(onSilence).toHaveBeenCalledWith('no-speech');
  });
});
