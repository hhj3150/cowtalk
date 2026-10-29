// 답변을 읽는 도중 중지하면, 그 뒤 스트림으로 도착하는 문장을 다시 읽지 않는다
import { describe, it, expect } from 'vitest';

const { canVoiceAnswer } = await import('../components/unified-dashboard/TinkerbellAssistant');

describe('canVoiceAnswer', () => {
  it('중지 전에는 읽는다', () => {
    expect(canVoiceAnswer(true, 3, 3)).toBe(true);
  });
  it('중지(세대 증가) 뒤 도착한 문장은 읽지 않는다', () => {
    expect(canVoiceAnswer(true, 4, 3)).toBe(false);
  });
  it('음성 답변이 꺼져 있으면 읽지 않는다', () => {
    expect(canVoiceAnswer(false, 3, 3)).toBe(false);
  });
});
