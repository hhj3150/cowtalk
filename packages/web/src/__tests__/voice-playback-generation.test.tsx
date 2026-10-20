// VO-05/06/07 회귀
//  VO-05: 합성 중에 끼어들어도 합성이 끝나면 그대로 재생됐고, 재생 '시작' 시점에 끝난 것으로 처리돼
//         핸즈프리 재청취가 말하는 도중 열렸다
//  VO-06: Chrome cancel() 이 낸 onerror 를 '다음 문장'으로 처리해 끼어들어도 계속 말했다
//  VO-07: 이전 인식기·늦은 Whisper 결과가 같은 발화를 두 번 제출했다
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

let resolveSynth: ((v: { audioBlob: Blob }) => void) | null = null;
vi.mock('@web/api/audio.api', () => ({
  speak: vi.fn(() => new Promise((r) => { resolveSynth = r as never; })),
}));

const created: FakeAudio[] = [];
class FakeAudio {
  onplay: (() => void) | null = null;
  onended: (() => void) | null = null;
  src = '';
  played = false;
  constructor(src: string) { this.src = src; created.push(this); }
  async play(): Promise<void> { this.played = true; this.onplay?.(); }
  pause(): void { /* noop */ }
}

beforeEach(() => {
  created.length = 0;
  resolveSynth = null;
  vi.stubGlobal('Audio', FakeAudio);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

const { useVoiceOutput } = await import('../hooks/useVoiceOutput');
const { isCancelSpeechError, shouldSubmitVoice } = await import('../components/unified-dashboard/TinkerbellAssistant');

describe('VO-05 useVoiceOutput', () => {
  it('합성 중 stopSpeaking 이면 결과가 와도 재생하지 않는다', async () => {
    const { result } = renderHook(() => useVoiceOutput({}));
    let done = false;
    let p!: Promise<void>;
    act(() => { p = result.current.speakText('안녕하세요').then(() => { done = true; }); });
    act(() => { result.current.stopSpeaking(); });
    await act(async () => { resolveSynth?.({ audioBlob: new Blob(['x']) }); await p; });
    expect(created).toHaveLength(0);
    expect(done).toBe(true);
  });

  it('Promise 는 재생 시작이 아니라 재생 종료 때 끝난다', async () => {
    const { result } = renderHook(() => useVoiceOutput({}));
    let done = false;
    let p!: Promise<void>;
    act(() => { p = result.current.speakText('안녕하세요').then(() => { done = true; }); });
    await act(async () => { resolveSynth?.({ audioBlob: new Blob(['x']) }); await Promise.resolve(); await Promise.resolve(); });
    expect(created[0]?.played).toBe(true);
    expect(done).toBe(false);
    await act(async () => { created[0]?.onended?.(); await p; });
    expect(done).toBe(true);
  });
});

describe('VO-06 isCancelSpeechError', () => {
  it('중단 오류만 체인을 멈춘다', () => {
    expect(isCancelSpeechError('canceled')).toBe(true);
    expect(isCancelSpeechError('interrupted')).toBe(true);
    expect(isCancelSpeechError('synthesis-failed')).toBe(false);
    expect(isCancelSpeechError(undefined)).toBe(false);
  });
});

describe('VO-07 shouldSubmitVoice', () => {
  it('현재 세션에서 한 번만', () => {
    expect(shouldSubmitVoice(3, 3, 2)).toBe(true);
    expect(shouldSubmitVoice(3, 3, 3)).toBe(false); // 같은 세션 두 번째
    expect(shouldSubmitVoice(2, 3, 1)).toBe(false); // 이전 세션의 늦은 결과
  });
});
