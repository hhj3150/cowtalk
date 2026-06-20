// 공개 통계 조립 테스트 — 랜딩 히어로 데이터 업그레이드
// aiEngines 하드코딩(6) → 실제 엔진 목록 길이, totalEvents 신규 노출 검증.

import { describe, it, expect } from 'vitest';
import { assemblePublicStats, AI_ENGINES, type RawStatCounts } from '../public-stats.routes.js';

const RAW: RawStatCounts = {
  totalFarms: 199,
  totalCattle: 10813,
  totalSensors: 8940,
  totalEvents: 123456,
  todayAlerts: 42,
  roleStats: [{ role: 'farmer', userCount: 5, farmCount: 0, cattleCount: 0 }],
};

describe('assemblePublicStats', () => {
  it('원시 카운트를 그대로 전달한다(농장/소/센서/이벤트/알림)', () => {
    const s = assemblePublicStats(RAW);
    expect(s.totalFarms).toBe(199);
    expect(s.totalCattle).toBe(10813);
    expect(s.totalSensors).toBe(8940);
    expect(s.totalEvents).toBe(123456);
    expect(s.todayAlerts).toBe(42);
  });

  it('aiEngines 는 하드코딩이 아니라 실제 엔진 목록 길이다', () => {
    const s = assemblePublicStats(RAW);
    expect(s.aiEngines).toBe(AI_ENGINES.length);
    expect(AI_ENGINES.length).toBeGreaterThan(0);
  });

  it('monitoring 은 24/7 로 유지된다(연속 가동 사실)', () => {
    expect(assemblePublicStats(RAW).monitoring).toBe('24/7');
  });

  it('AI_ENGINES 목록은 빈 문자열 없이 고유 항목으로 구성된다', () => {
    expect(AI_ENGINES.every((e) => e.trim().length > 0)).toBe(true);
    expect(new Set(AI_ENGINES).size).toBe(AI_ENGINES.length);
  });
});
