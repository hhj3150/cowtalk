// VO-09 회귀 — TTS 캐시가 개수만 제한해 긴 음성이 쌓이면 메모리가 커지던 문제
import { describe, it, expect, beforeEach } from 'vitest';
import { setCache, ttsCacheStats, CACHE_MAX_BYTES, __testing } from '../tts.service.js';

beforeEach(() => { __testing.clearCache(); });

describe('VO-09 TTS 캐시 용량 상한', () => {
  it('총 용량을 넘으면 오래된 것부터 내보낸다', () => {
    const chunk = Buffer.alloc(Math.floor(CACHE_MAX_BYTES / 3) + 1);
    setCache('a', chunk, 'audio/mpeg');
    setCache('b', chunk, 'audio/mpeg');
    setCache('c', chunk, 'audio/mpeg');
    const s = ttsCacheStats();
    expect(s.bytes).toBeLessThanOrEqual(CACHE_MAX_BYTES);
    expect(s.entries).toBe(2);
  });
  it('같은 키 재저장은 중복 계산하지 않는다', () => {
    setCache('a', Buffer.alloc(100), 'audio/mpeg');
    setCache('a', Buffer.alloc(100), 'audio/mpeg');
    expect(ttsCacheStats()).toEqual({ entries: 1, bytes: 100 });
  });
  it('상한보다 큰 단일 음성은 캐시하지 않는다', () => {
    setCache('big', Buffer.alloc(CACHE_MAX_BYTES + 1), 'audio/mpeg');
    expect(ttsCacheStats().entries).toBe(0);
  });
});
