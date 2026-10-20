// AI-08 회귀 — 생성 브리핑이 메모리 캐시에만 있어 사후에 근거·모델을 확인할 수 없던 문제
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rows: Array<Record<string, unknown>> = [];
let failInsert = false;
vi.mock('../config/database.js', () => ({
  getDb: () => ({ insert: () => ({ values: async (v: Record<string, unknown>) => { if (failInsert) throw new Error('relation does not exist'); rows.push(v); } }) }),
}));
vi.mock('../ai-brain/claude-client.js', () => ({
  isClaudeAvailable: () => true,
  callClaudeForChatJson: vi.fn(async () => ({
    parsed: { summary: '알림 12건, 긴급 1건', recommendations: ['423번 확인'] },
    rawText: '', model: 'model-x', inputTokens: 0, outputTokens: 0, durationMs: 1,
  })),
}));
vi.mock('../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { generateBriefingNarrative, clearBriefingCache } = await import('./briefing-ai.service.js');
const FACTS = {
  role: 'farmer', farmId: null, farmCount: 1, animalCount: 80, total24h: 12, changePercent: 0,
  direction: 'stable' as const, topFarms: [], eventDistribution: [], criticalCount: 1,
};

beforeEach(() => { rows.length = 0; failInsert = false; clearBriefingCache(); });

describe('AI-08 브리핑 보존', () => {
  it('생성 결과를 근거 집계·모델과 함께 남긴다', async () => {
    await generateBriefingNarrative(FACTS);
    await new Promise((r) => setTimeout(r, 0));
    expect(rows[0]).toMatchObject({ role: 'farmer', summary: '알림 12건, 긴급 1건', recommendations: ['423번 확인'], model: 'model-x', facts: FACTS });
  });
  it('보존 실패해도 브리핑은 그대로 돌려준다', async () => {
    failInsert = true;
    expect(await generateBriefingNarrative(FACTS)).toEqual({ summary: '알림 12건, 긴급 1건', recommendations: ['423번 확인'] });
  });
});
