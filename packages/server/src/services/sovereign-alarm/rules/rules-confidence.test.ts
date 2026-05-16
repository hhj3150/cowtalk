// SovereignAlarm 룰 confidence 단위 회귀 테스트 — BUG-005 / D4
//
// 모든 룰의 confidence 출력이 0-1 범위인지 검증한다.
// (BUG-005 이전엔 0-100 정수였음 — 회귀 시 이 테스트가 차단)

import { describe, it, expect } from 'vitest';
import { getAllRules } from './rule-registry.js';
import type { DailySummary, AnimalProfile } from '../types.js';

function day(tempAvg: number | null, rumAvg: number | null, actAvg: number | null, drSum: number | null = 30): DailySummary {
  return { date: '2026-05-17', tempAvg, rumAvg, actAvg, drSum };
}

/** 다양한 신호 강도의 10일치 summary 시나리오 — 여러 룰을 동시 발화시킨다. */
const SCENARIOS: ReadonlyArray<{ name: string; summary: DailySummary[]; animal: AnimalProfile }> = [
  {
    name: '고열 + 반추급감 (질병 룰)',
    summary: [
      day(41.0, 200, 1.0), day(40.8, 220, 1.2),
      day(39.0, 480, 3.0), day(39.0, 470, 3.0), day(39.0, 490, 3.0),
      day(39.0, 480, 3.0), day(39.0, 485, 3.0), day(39.0, 480, 3.0),
      day(39.0, 480, 3.0), day(39.0, 480, 3.0),
    ],
    animal: { animalId: 'a1', farmId: 'f1', earTag: '001', name: null, daysInMilk: 30, parity: 4, lactationStatus: 'lactating' },
  },
  {
    name: '저체온 + 활동급감 (분만/유열)',
    summary: [
      day(37.0, 300, 0.5), day(37.2, 320, 0.6),
      day(38.8, 480, 3.0), day(38.8, 470, 3.0), day(38.8, 490, 3.0),
      day(38.8, 480, 3.0), day(38.8, 485, 3.0),
    ],
    animal: { animalId: 'a2', farmId: 'f1', earTag: '002', name: null, daysInMilk: 1, parity: 3, lactationStatus: 'fresh' },
  },
  {
    name: '활동급증 (발정)',
    summary: [
      day(39.4, 450, 8.0),
      day(38.9, 480, 2.0), day(38.9, 480, 2.1), day(38.9, 480, 1.9),
      day(38.9, 480, 2.0), day(38.9, 480, 2.0),
    ],
    animal: { animalId: 'a3', farmId: 'f1', earTag: '003', name: null, daysInMilk: 90, parity: 2, lactationStatus: 'lactating' },
  },
  {
    name: '건유우 분만임박 (체온하강)',
    summary: [
      day(38.0, 400, 1.5),
      day(38.9, 420, 2.0), day(38.9, 410, 2.0), day(38.9, 420, 2.0),
      day(38.9, 420, 2.0), day(38.9, 420, 2.0),
    ],
    animal: { animalId: 'a4', farmId: 'f1', earTag: '004', name: null, daysInMilk: 280, parity: 3, lactationStatus: 'dry' },
  },
  {
    name: '극단 입력 (clamp 검증)',
    summary: [
      day(45.0, 0, 50.0), day(45.0, 0, 50.0),
      day(38.0, 600, 2.0), day(38.0, 600, 2.0), day(38.0, 600, 2.0),
      day(38.0, 600, 2.0), day(38.0, 600, 2.0),
    ],
    animal: { animalId: 'a5', farmId: 'f1', earTag: '005', name: null, daysInMilk: 20, parity: 5, lactationStatus: 'lactating' },
  },
];

describe('SovereignAlarm 룰 confidence — D4 0-1 단위 (BUG-005)', () => {
  const rules = getAllRules();

  it('레지스트리에 룰이 등록되어 있다', () => {
    expect(rules.length).toBeGreaterThan(0);
  });

  it('모든 시나리오 × 모든 룰: confidence ∈ [0,1] (0-100 정수 금지)', () => {
    let firedCount = 0;
    for (const scenario of SCENARIOS) {
      for (const def of rules) {
        const alarm = def.rule(scenario.summary, scenario.animal);
        if (alarm === null) continue;
        firedCount += 1;
        expect(Number.isFinite(alarm.confidence), `${scenario.name}/${def.eventType}`).toBe(true);
        expect(alarm.confidence, `${scenario.name}/${def.eventType} 하한`).toBeGreaterThanOrEqual(0);
        expect(alarm.confidence, `${scenario.name}/${def.eventType} 상한`).toBeLessThanOrEqual(1);
        // 0-100 정수 회귀 방지: 1 초과면 즉시 실패 (단, 정확히 1.0은 허용)
        expect(alarm.confidence, `${scenario.name}/${def.eventType} 0-100 회귀`).not.toBeGreaterThan(1);
      }
    }
    // 시나리오가 최소 몇 개 룰은 발화시켜야 테스트가 유의미
    expect(firedCount).toBeGreaterThan(0);
  });
});
