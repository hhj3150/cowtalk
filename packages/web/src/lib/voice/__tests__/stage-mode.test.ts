import { describe, it, expect } from 'vitest';
import { shouldWakeListen, readStageMode, writeStageMode, subscribeStageMode } from '../stage-mode';

describe('강연 모드 — 호명 청취 범위', () => {
  const base = { alwaysOpen: true, wakeEnabled: true } as const;
  it('평소: 말하는 중·생각 중에도 듣는다 (끼어들기), 듣기 중엔 끈다', () => {
    expect(shouldWakeListen({ ...base, stageMode: false, state: 'speaking' })).toBe(true);
    expect(shouldWakeListen({ ...base, stageMode: false, state: 'thinking' })).toBe(true);
    expect(shouldWakeListen({ ...base, stageMode: false, state: 'listening' })).toBe(false);
  });
  it('강연 모드: 대기 중에만 듣는다 — 스피커 소리에 반응하지 않게', () => {
    expect(shouldWakeListen({ ...base, stageMode: true, state: 'idle' })).toBe(true);
    expect(shouldWakeListen({ ...base, stageMode: true, state: 'speaking' })).toBe(false);
    expect(shouldWakeListen({ ...base, stageMode: true, state: 'thinking' })).toBe(false);
  });
  it('호명 꺼짐이면 항상 끔', () => {
    expect(shouldWakeListen({ alwaysOpen: true, wakeEnabled: false, stageMode: false, state: 'idle' })).toBe(false);
  });
  it('저장·구독', () => {
    const seen: boolean[] = [];
    const off = subscribeStageMode((on) => seen.push(on));
    writeStageMode(true);
    expect(readStageMode()).toBe(true);
    writeStageMode(false);
    off();
    writeStageMode(true);
    expect(seen).toEqual([true, false]);
  });
});
