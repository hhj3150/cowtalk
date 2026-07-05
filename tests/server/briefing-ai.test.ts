// AI 일일 브리핑 생성 — Claude 생성 + 템플릿 fallback (규칙 7)

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  isClaudeAvailable: vi.fn<() => boolean>(() => false),
  callClaudeForChatJson: vi.fn(),
}));

vi.mock('@server/ai-brain/claude-client.js', () => ({
  isClaudeAvailable: mocks.isClaudeAvailable,
  callClaudeForChatJson: mocks.callClaudeForChatJson,
}));

import { generateBriefingNarrative, clearBriefingCache, type BriefingFacts } from '@server/serving/briefing-ai.service.js';

const FACTS: BriefingFacts = {
  role: 'farmer',
  farmId: 'farm-1',
  farmCount: 1,
  animalCount: 87,
  total24h: 12,
  changePercent: 8,
  direction: 'up',
  topFarms: [{ farmName: '해돋이목장', alertCount: 12, topEventType: 'estrus' }],
  eventDistribution: [{ eventType: 'estrus', count: 5 }, { eventType: 'temperature_high', count: 3 }],
  criticalCount: 1,
};

beforeEach(() => {
  clearBriefingCache();
  mocks.isClaudeAvailable.mockReset();
  mocks.callClaudeForChatJson.mockReset();
});

describe('generateBriefingNarrative', () => {
  it('Claude 불가 시 null — 호출부 템플릿 fallback (규칙 7)', async () => {
    mocks.isClaudeAvailable.mockReturnValue(false);
    const result = await generateBriefingNarrative(FACTS);
    expect(result).toBeNull();
    expect(mocks.callClaudeForChatJson).not.toHaveBeenCalled();
  });

  it('Claude 응답 → summary + recommendations 반환', async () => {
    mocks.isClaudeAvailable.mockReturnValue(true);
    mocks.callClaudeForChatJson.mockResolvedValue({
      parsed: {
        summary: '오늘 발정 5두가 수정 적기입니다. 체온 이상 3두는 오전 중 확인이 필요합니다.',
        recommendations: ['발정 5두 수정 예약', '고체온 3두 오전 점검'],
      },
      rawText: '', model: 'test', inputTokens: 0, outputTokens: 0, durationMs: 10,
    });

    const result = await generateBriefingNarrative(FACTS);
    expect(result).not.toBeNull();
    expect(result!.summary).toContain('발정 5두');
    expect(result!.recommendations).toHaveLength(2);
  });

  it('summary 없는 불량 응답 → null (템플릿 유지)', async () => {
    mocks.isClaudeAvailable.mockReturnValue(true);
    mocks.callClaudeForChatJson.mockResolvedValue({
      parsed: { recommendations: ['뭔가'] },
      rawText: '', model: 'test', inputTokens: 0, outputTokens: 0, durationMs: 10,
    });
    expect(await generateBriefingNarrative(FACTS)).toBeNull();
  });

  it('동일 상황 반복 호출 — 캐시로 Claude 1회만 호출', async () => {
    mocks.isClaudeAvailable.mockReturnValue(true);
    mocks.callClaudeForChatJson.mockResolvedValue({
      parsed: { summary: '캐시 테스트 요약입니다.', recommendations: [] },
      rawText: '', model: 'test', inputTokens: 0, outputTokens: 0, durationMs: 10,
    });

    await generateBriefingNarrative(FACTS);
    await generateBriefingNarrative(FACTS);
    expect(mocks.callClaudeForChatJson).toHaveBeenCalledTimes(1);
  });
});
