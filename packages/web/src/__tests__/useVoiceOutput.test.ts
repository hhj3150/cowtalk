// useVoiceOutput — TTS↔STT 피드백 루프 차단 회귀 테스트
//
// 검증 포인트 (Day 1-2 P0-B 수정):
// 1) speakText()는 audio.play()가 아니라 onended까지 await한다 (피드백 루프의 근본 원인)
// 2) cleanup()이 isPlaying을 false로 정리한다 (barge-in 시 영구 차단 방지)
// 3) cleanup()이 endResolverRef를 깨워서 await가 풀린다 (await 누수 방지)

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceOutput } from '@web/hooks/useVoiceOutput';

vi.mock('@web/api/audio.api', () => ({
  speak: vi.fn(async () => ({
    audioBlob: new Blob([new Uint8Array([0])], { type: 'audio/mpeg' }),
    voice: 'nova',
  })),
}));

interface FakeAudio {
  src: string;
  paused: boolean;
  onplay: (() => void) | null;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  play: () => Promise<void>;
  pause: () => void;
  triggerEnd: () => void;
}

function setupAudioMock(): { audios: FakeAudio[]; cleanup: () => void } {
  const audios: FakeAudio[] = [];
  const OriginalAudio = global.Audio;
  global.Audio = vi.fn().mockImplementation(() => {
    const audio: FakeAudio = {
      src: '',
      paused: false,
      onplay: null,
      onended: null,
      onerror: null,
      play: vi.fn(async () => {
        // play()는 재생 시작 시 즉시 resolve — 실제 종료는 별도
        queueMicrotask(() => audio.onplay?.());
      }),
      pause: vi.fn(() => { audio.paused = true; }),
      triggerEnd: () => audio.onended?.(),
    };
    audios.push(audio);
    return audio as unknown as HTMLAudioElement;
  }) as unknown as typeof Audio;

  const OriginalURL = global.URL.createObjectURL;
  global.URL.createObjectURL = vi.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = vi.fn();

  return {
    audios,
    cleanup: () => {
      global.Audio = OriginalAudio;
      global.URL.createObjectURL = OriginalURL;
    },
  };
}

describe('useVoiceOutput — 피드백 루프 차단', () => {
  let mock: ReturnType<typeof setupAudioMock>;

  beforeEach(() => {
    mock = setupAudioMock();
  });

  afterEach(() => {
    mock.cleanup();
    vi.clearAllMocks();
  });

  it('speakText는 audio.play() 시점이 아니라 onended까지 대기한다', async () => {
    const { result } = renderHook(() => useVoiceOutput());

    let resolved = false;
    let speakPromise: Promise<void>;
    await act(async () => {
      speakPromise = result.current.speakText('테스트 발화');
      speakPromise.then(() => { resolved = true; });
      // play() 완료까지 대기 (microtask 1회)
      await new Promise<void>((r) => setTimeout(r, 50));
    });

    // play()는 끝났지만 onended는 아직 — speakText는 resolve되면 안 됨
    expect(resolved).toBe(false);
    expect(result.current.isPlaying).toBe(true);

    // 재생 종료 시뮬레이션
    await act(async () => {
      mock.audios[0]!.triggerEnd();
      // 200ms tail guard 대기
      await new Promise<void>((r) => setTimeout(r, 250));
      await speakPromise;
    });

    expect(resolved).toBe(true);
    expect(result.current.isPlaying).toBe(false);
  });

  it('stopSpeaking (barge-in)이 isPlaying을 false로 정리하고 await를 해제한다', async () => {
    const { result } = renderHook(() => useVoiceOutput());

    let resolved = false;
    let speakPromise: Promise<void>;
    await act(async () => {
      speakPromise = result.current.speakText('긴 발화');
      speakPromise.then(() => { resolved = true; });
      await new Promise<void>((r) => setTimeout(r, 50));
    });

    expect(result.current.isPlaying).toBe(true);

    // barge-in
    await act(async () => {
      result.current.stopSpeaking();
      await new Promise<void>((r) => setTimeout(r, 250));
      await speakPromise;
    });

    // isPlaying은 false (wake word 차단 해제), await도 풀림
    expect(result.current.isPlaying).toBe(false);
    expect(resolved).toBe(true);
  });

  it('연속 speakText 호출 시 이전 발화를 정리하고 새 발화를 시작한다', async () => {
    const { result } = renderHook(() => useVoiceOutput());

    let first: Promise<void>;
    await act(async () => {
      first = result.current.speakText('첫 번째');
      await new Promise<void>((r) => setTimeout(r, 50));
    });

    expect(result.current.isPlaying).toBe(true);
    expect(mock.audios.length).toBe(1);

    // 두 번째 발화 — 첫 번째를 cleanup하고 새 audio 생성
    await act(async () => {
      const second = result.current.speakText('두 번째');
      await new Promise<void>((r) => setTimeout(r, 50));
      await first; // 첫 발화는 cleanup으로 깨워짐
      mock.audios[1]!.triggerEnd();
      await new Promise<void>((r) => setTimeout(r, 250));
      await second;
    });

    expect(mock.audios.length).toBe(2);
    expect(result.current.isPlaying).toBe(false);
  });
});
