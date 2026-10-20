// AI-09 회귀 — 손으로 정한 경험치가 'confidence'(신뢰도)로 나가 실측 신뢰도처럼 읽히던 문제
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../config/database.js', () => ({ getDb: () => ({}) }));
const { deriveFusionInterpretation } = await import('../dashboard.routes.js');

describe('AI-09 deriveFusionInterpretation', () => {
  it('경험치는 heuristicScore + scoreKind 로, confidence 이름을 쓰지 않는다', () => {
    const r = deriveFusionInterpretation(['temperature_warning', 'rumination_warning']);
    expect(r.primary).toMatchObject({ scoreKind: 'heuristic' });
    expect(typeof r.primary.heuristicScore).toBe('number');
    expect(r.primary).not.toHaveProperty('confidence');
    expect(r.secondary).not.toHaveProperty('confidence');
  });
});
