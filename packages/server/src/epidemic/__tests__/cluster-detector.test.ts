import { describe, it, expect } from 'vitest';
import {
  detectClusters,
  aggregateEventsByFarm,
  isEpidemicRelevantEvent,
  type HealthEventRecord,
} from '../cluster-detector.js';
import type { FarmWithCoordinates } from '../geo-utils.js';

// 테스트 데이터: 충남 지역 농장 5개 (가까움) + 경남 농장 1개 (멀리)
const FARMS: FarmWithCoordinates[] = [
  { farmId: 'f1', farmName: '충남A', coordinates: { lat: 36.50, lng: 127.00 } },
  { farmId: 'f2', farmName: '충남B', coordinates: { lat: 36.52, lng: 127.02 } },
  { farmId: 'f3', farmName: '충남C', coordinates: { lat: 36.48, lng: 126.98 } },
  { farmId: 'f4', farmName: '충남D', coordinates: { lat: 36.51, lng: 127.01 } },
  { farmId: 'f5', farmName: '충남E', coordinates: { lat: 36.49, lng: 126.99 } },
  { farmId: 'f6', farmName: '경남F', coordinates: { lat: 35.00, lng: 128.50 } },
];

const now = new Date();

function makeEvents(farmId: string, count: number, eventType = 'health_101'): HealthEventRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    eventId: `${farmId}-evt-${i}`,
    eventType,
    detectedAt: new Date(now.getTime() - i * 60 * 60 * 1000),
    severity: 'high',
    animalId: `${farmId}-animal-${i}`,
  }));
}

describe('isEpidemicRelevantEvent', () => {
  it('건강 이벤트는 관련으로 판정', () => {
    expect(isEpidemicRelevantEvent('health_warning')).toBe(true);
    expect(isEpidemicRelevantEvent('temperature_warning')).toBe(true);
    expect(isEpidemicRelevantEvent('health_101')).toBe(true);
    expect(isEpidemicRelevantEvent('health_310')).toBe(true);
    expect(isEpidemicRelevantEvent('clinical_condition_401')).toBe(true);
  });

  it('비건강 이벤트는 비관련', () => {
    expect(isEpidemicRelevantEvent('estrus')).toBe(false);
    expect(isEpidemicRelevantEvent('calving')).toBe(false);
    expect(isEpidemicRelevantEvent('activity_warning')).toBe(false);
  });
});

describe('aggregateEventsByFarm', () => {
  it('농장별 이벤트 집계', () => {
    const events = [
      ...makeEvents('f1', 3),
      ...makeEvents('f2', 2),
      ...makeEvents('f3', 1), // 최소 기준 미달 (MIN_EVENTS_PER_FARM=2)
    ];

    const farmIdToEvents = new Map<string, HealthEventRecord[]>();
    farmIdToEvents.set('f1', makeEvents('f1', 3));
    farmIdToEvents.set('f2', makeEvents('f2', 2));
    farmIdToEvents.set('f3', makeEvents('f3', 1));

    const result = aggregateEventsByFarm(events, FARMS, farmIdToEvents);

    // f3는 이벤트 1건이므로 MIN_EVENTS_PER_FARM(2) 미달 → 제외
    expect(result.length).toBe(2);
    expect(result.find((a) => a.farmId === 'f1')?.totalEventCount).toBe(3);
    expect(result.find((a) => a.farmId === 'f2')?.totalEventCount).toBe(2);
  });
});

describe('detectClusters', () => {
  it('가까운 농장 3개 이상에서 이벤트 발생 시 클러스터 감지', () => {
    const farmIdToEvents = new Map<string, HealthEventRecord[]>();
    farmIdToEvents.set('f1', makeEvents('f1', 3));
    farmIdToEvents.set('f2', makeEvents('f2', 3));
    farmIdToEvents.set('f4', makeEvents('f4', 2));

    const allEvents = [...makeEvents('f1', 3), ...makeEvents('f2', 3), ...makeEvents('f4', 2)];
    const aggregates = aggregateEventsByFarm(allEvents, FARMS, farmIdToEvents);
    const clusters = detectClusters(aggregates);

    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters[0]!.farms.length).toBeGreaterThanOrEqual(3);
    expect(clusters[0]!.level).toBeDefined();
  });

  it('농장 수 부족 시 클러스터 미감지', () => {
    const farmIdToEvents = new Map<string, HealthEventRecord[]>();
    farmIdToEvents.set('f1', makeEvents('f1', 3));
    farmIdToEvents.set('f6', makeEvents('f6', 3)); // 멀리 떨어진 농장

    const allEvents = [...makeEvents('f1', 3), ...makeEvents('f6', 3)];
    const aggregates = aggregateEventsByFarm(allEvents, FARMS, farmIdToEvents);
    const clusters = detectClusters(aggregates);

    expect(clusters.length).toBe(0);
  });

  it('대규모 발생 시 outbreak 레벨', () => {
    // 10개 농장 시뮬레이션 (같은 지역)
    const manyFarms: FarmWithCoordinates[] = Array.from({ length: 12 }, (_, i) => ({
      farmId: `mf${i}`,
      farmName: `농장${i}`,
      coordinates: { lat: 36.50 + i * 0.01, lng: 127.00 + i * 0.01 },
    }));

    const farmIdToEvents = new Map<string, HealthEventRecord[]>();
    for (const farm of manyFarms) {
      farmIdToEvents.set(farm.farmId, makeEvents(farm.farmId, 3));
    }

    const allEvents = manyFarms.flatMap((f) => makeEvents(f.farmId, 3));
    const aggregates = aggregateEventsByFarm(allEvents, manyFarms, farmIdToEvents);
    const clusters = detectClusters(aggregates);

    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters[0]!.level).toBe('outbreak');
  });
});
