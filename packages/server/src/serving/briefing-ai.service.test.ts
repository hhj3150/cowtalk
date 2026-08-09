// 브리핑 생성이 응답 경로를 막지 않는가.
//
// 회귀 대상: 예전에는 대시보드 요청이 Claude 생성을 최대 8초 기다렸다. 콜드 스타트가 겹치면
// 프론트 기본 타임아웃(15초)을 넘겨 위젯이 아무것도 그리지 못했다.
// 이제 캐시가 없으면 즉시 null(→ 호출부 템플릿 요약)을 돌려주고 생성은 뒤에서 돈다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const callClaude = vi.fn();
const claudeAvailable = vi.fn(() => true);

vi.mock('../ai-brain/claude-client.js', () => ({
  callClaudeForChatJson: (...args: unknown[]) => callClaude(...args),
  isClaudeAvailable: () => claudeAvailable(),
}));

const { getCachedBriefingNarrative, clearBriefingCache } = await import('./briefing-ai.service.js');

const FACTS = {
  role: 'farmer',
  farmId: null,
  farmCount: 5,
  animalCount: 250,
  total24h: 12,
  changePercent: 20,
  direction: 'up' as const,
  topFarms: [],
  eventDistribution: [],
  criticalCount: 1,
};

/** Claude 응답을 흉내내되 지연을 준다 — 응답 경로가 이걸 기다리면 테스트가 잡아낸다 */
function slowClaude(delayMs: number, summary = 'AI가 쓴 요약입니다.') {
  return vi.fn(async () => {
    await new Promise((r) => setTimeout(r, delayMs));
    return {
      parsed: { summary, recommendations: ['조치 하나'] },
      rawText: '',
      model: 'test',
      inputTokens: 0,
      outputTokens: 0,
      durationMs: delayMs,
    };
  });
}

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  clearBriefingCache();
  callClaude.mockReset();
  claudeAvailable.mockReturnValue(true);
});

afterEach(() => {
  clearBriefingCache();
});

describe('getCachedBriefingNarrative — 응답 경로 비차단', () => {
  it('캐시가 없으면 Claude를 기다리지 않고 즉시 null을 준다', () => {
    callClaude.mockImplementation(slowClaude(500));

    const started = Date.now();
    const result = getCachedBriefingNarrative(FACTS);

    // 동기 반환 — await 조차 없다
    expect(result).toBeNull();
    expect(Date.now() - started).toBeLessThan(50);
  });

  it('백그라운드 생성이 끝나면 다음 호출에서 AI 요약을 준다', async () => {
    callClaude.mockImplementation(slowClaude(20));

    expect(getCachedBriefingNarrative(FACTS)).toBeNull(); // 1회차 — 템플릿으로 나감
    await flush(120);                                     // 백그라운드 생성 완료 대기

    const second = getCachedBriefingNarrative(FACTS);
    expect(second?.summary).toBe('AI가 쓴 요약입니다.');
    expect(second?.recommendations).toEqual(['조치 하나']);
  });

  it('생성이 도는 중에는 같은 키로 Claude를 중복 호출하지 않는다', async () => {
    callClaude.mockImplementation(slowClaude(50));

    getCachedBriefingNarrative(FACTS);
    getCachedBriefingNarrative(FACTS);
    getCachedBriefingNarrative(FACTS);
    await flush(150);

    expect(callClaude).toHaveBeenCalledTimes(1);
  });

  it('Claude를 쓸 수 없으면 호출조차 하지 않는다 (템플릿 유지)', () => {
    claudeAvailable.mockReturnValue(false);

    expect(getCachedBriefingNarrative(FACTS)).toBeNull();
    expect(callClaude).not.toHaveBeenCalled();
  });

  it('백그라운드 생성이 실패해도 예외가 새어나오지 않는다', async () => {
    callClaude.mockRejectedValue(new Error('Claude 폭발'));

    expect(() => getCachedBriefingNarrative(FACTS)).not.toThrow();
    await flush(50);
    // 실패했으니 캐시도 비어 있고, 다음 호출도 여전히 null (템플릿 유지)
    expect(getCachedBriefingNarrative(FACTS)).toBeNull();
  });

  it('역할이 다르면 캐시를 공유하지 않는다', async () => {
    callClaude.mockImplementation(slowClaude(20, '농장주용 요약'));
    getCachedBriefingNarrative(FACTS);
    await flush(120);

    expect(getCachedBriefingNarrative(FACTS)?.summary).toBe('농장주용 요약');
    // 수의사 키는 아직 생성 전 → null
    expect(getCachedBriefingNarrative({ ...FACTS, role: 'veterinarian' })).toBeNull();
  });
});
