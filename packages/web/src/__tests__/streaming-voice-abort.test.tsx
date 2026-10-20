// VO-12 회귀 — 음성을 멈춰도 이미 보낸 TTS 합성 요청은 끝까지 돌아 비용이 발생하던 문제
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const signals: AbortSignal[] = [];
vi.mock('@web/api/audio.api', () => ({
  speak: vi.fn((_req: unknown, signal?: AbortSignal) => {
    if (signal) signals.push(signal);
    return new Promise(() => { /* 응답 대기 중 */ });
  }),
}));

const { useStreamingVoice } = await import('../hooks/useStreamingVoice');

describe('VO-12 useStreamingVoice', () => {
  it('stop() 하면 진행 중인 합성 요청이 모두 취소된다', () => {
    const { result } = renderHook(() => useStreamingVoice({}));
    act(() => { result.current.enqueue('첫 문장입니다.'); result.current.enqueue('둘째 문장입니다.'); });
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => !s.aborted)).toBe(true);
    act(() => { result.current.stop(); });
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
});
