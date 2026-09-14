// 군 센서 개요 — 순수 함수 단위 테스트
// 목장↔품종↔지역↔전국 평균 비교의 계산 규칙이 조용히 바뀌지 않도록 고정한다.

import { describe, it, expect } from 'vitest';
import type { HerdMetricStat, HerdSensorOverview } from '@cowtalk/shared';
import {
  classifyBreedGroup,
  pickDominantBreed,
  computeDelta,
  computeTrend,
  toStat,
  buildOverviewLines,
  BREED_REFERENCE_RANGES,
  OVERVIEW_METRICS,
} from '../herd-sensor-overview.service.js';

const stat = (avg: number, extra: Partial<HerdMetricStat> = {}): HerdMetricStat => ({
  avg, min: avg - 1, max: avg + 1, stddev: 0.3, animals: 10, farms: 1, rows: 70, ...extra,
});

describe('classifyBreedGroup — 품종군 판별', () => {
  it('물소 계열은 대소문자·한글 무관하게 buffalo', () => {
    expect(classifyBreedGroup('buffalo')).toBe('buffalo');
    expect(classifyBreedGroup('Carabao')).toBe('buffalo');
    expect(classifyBreedGroup('Murrah buffalo')).toBe('buffalo');
    expect(classifyBreedGroup('물소')).toBe('buffalo');
  });

  it('한우·앵거스는 beef, 홀스타인·저지는 dairy', () => {
    expect(classifyBreedGroup('hanwoo')).toBe('beef');
    expect(classifyBreedGroup('Angus')).toBe('beef');
    expect(classifyBreedGroup('holstein')).toBe('dairy');
    expect(classifyBreedGroup('jersey')).toBe('dairy');
  });

  it('빈 값은 other', () => {
    expect(classifyBreedGroup(null)).toBe('other');
    expect(classifyBreedGroup('')).toBe('other');
  });

  it('모든 품종군에 참고 범위가 있고 물소 체온 하한이 소보다 낮다', () => {
    for (const g of ['dairy', 'beef', 'buffalo', 'other'] as const) {
      expect(BREED_REFERENCE_RANGES[g].temperature[0]).toBeLessThan(BREED_REFERENCE_RANGES[g].temperature[1]);
      expect(BREED_REFERENCE_RANGES[g].rumination[0]).toBeLessThan(BREED_REFERENCE_RANGES[g].rumination[1]);
    }
    expect(BREED_REFERENCE_RANGES.buffalo.temperature[0]).toBeLessThan(BREED_REFERENCE_RANGES.dairy.temperature[0]);
  });
});

describe('pickDominantBreed — 다수 품종', () => {
  it('두수가 가장 많은 품종을 고른다', () => {
    expect(pickDominantBreed([{ breed: 'holstein', count: 3 }, { breed: 'jersey', count: 40 }])).toBe('jersey');
  });
  it('동률이면 사전순 앞 (결정적)', () => {
    expect(pickDominantBreed([{ breed: 'jersey', count: 5 }, { breed: 'holstein', count: 5 }])).toBe('holstein');
  });
  it('빈 목록은 null', () => {
    expect(pickDominantBreed([])).toBeNull();
  });
});

describe('computeDelta — 목장 − 기준', () => {
  it('둘 다 있으면 소수 둘째 자리 차이', () => {
    expect(computeDelta(stat(38.71), stat(38.5))).toBe(0.21);
    expect(computeDelta(stat(430), stat(470))).toBe(-40);
  });
  it('한쪽이 없으면 null (0으로 위장하지 않는다)', () => {
    expect(computeDelta(null, stat(38.5))).toBeNull();
    expect(computeDelta(stat(38.5), null)).toBeNull();
  });
});

describe('computeTrend — 뒤 절반 − 앞 절반', () => {
  it('상승 추세는 양수', () => {
    const pts = [
      { date: '2026-09-01', avg: 400 }, { date: '2026-09-02', avg: 410 },
      { date: '2026-09-03', avg: 440 }, { date: '2026-09-04', avg: 450 },
    ];
    expect(computeTrend(pts)).toBe(40);
  });
  it('정렬되지 않은 입력도 날짜순으로 계산', () => {
    const pts = [
      { date: '2026-09-04', avg: 450 }, { date: '2026-09-01', avg: 400 },
      { date: '2026-09-03', avg: 440 }, { date: '2026-09-02', avg: 410 },
    ];
    expect(computeTrend(pts)).toBe(40);
  });
  it('홀수 개수면 가운데 날은 양쪽 모두에서 제외', () => {
    const pts = [
      { date: '2026-09-01', avg: 38.0 }, { date: '2026-09-02', avg: 38.0 },
      { date: '2026-09-03', avg: 99 },
      { date: '2026-09-04', avg: 38.5 }, { date: '2026-09-05', avg: 38.5 },
    ];
    expect(computeTrend(pts)).toBe(0.5);
  });
  it('4일 미만이면 추세를 말하지 않는다', () => {
    expect(computeTrend([{ date: '2026-09-01', avg: 1 }, { date: '2026-09-02', avg: 2 }, { date: '2026-09-03', avg: 3 }])).toBeNull();
    expect(computeTrend([])).toBeNull();
  });
});

describe('toStat — 집계 행 변환', () => {
  it('문자열 숫자(postgres numeric)도 숫자로, 자릿수 반올림', () => {
    const s = toStat({ animals: '12', farms: '1', avg: '38.71234', min: '37.9', max: '40.1', stddev: '0.234', rows: '84' }, 2);
    expect(s).toEqual({ avg: 38.71, min: 37.9, max: 40.1, stddev: 0.23, animals: 12, farms: 1, rows: 84 });
  });
  it('개체 0이면 null — 평균이 존재하지 않는다', () => {
    expect(toStat({ animals: 0, farms: 0, avg: null, min: null, max: null, stddev: null, rows: 0 })).toBeNull();
    expect(toStat(undefined)).toBeNull();
  });
});

describe('buildOverviewLines — 프롬프트 블록', () => {
  const overview: HerdSensorOverview = {
    farmId: 'f1',
    farmName: '송영신목장',
    days: 7,
    from: '2026-09-07',
    to: '2026-09-14',
    coverage: {
      farmTotalAnimals: 60, farmAnimalsWithData: 58,
      herd: { total: 60, withSensor: 59, milking: 44, dry: 8, heifer: 8, avgParity: 2.4, avgDaysInMilk: 172 },
      breedLabel: 'jersey', breedGroup: 'dairy',
      province: '경기', regionFarms: 52, nationalFarms: 201,
    },
    metrics: [
      {
        metric: 'temperature', unit: '°C',
        farm: stat(38.7, { animals: 58 }), breed: stat(38.5, { animals: 300, farms: 9 }),
        region: stat(38.6, { farms: 52 }), national: stat(38.55, { farms: 201 }),
        deltaVsBreed: 0.2, deltaVsRegion: 0.1, deltaVsNational: 0.15, farmTrend: 0.05,
      },
      {
        metric: 'rumination', unit: '분/일',
        farm: null, breed: stat(470), region: null, national: stat(465, { farms: 190 }),
        deltaVsBreed: null, deltaVsRegion: null, deltaVsNational: null, farmTrend: null,
      },
    ],
    notes: ['pH·음수량은 별도 볼루스 — 개요 대상 아님'],
    computedAt: '2026-09-14T00:00:00.000Z',
  };

  it('표 헤더·행·범위·주석이 모두 들어간다', () => {
    const text = buildOverviewLines(overview).join('\n');
    expect(text).toContain('군 센서 개요 — 최근 7일');
    expect(text).toContain('| 체온 | 38.7°C (58두, 범위 37.7°C~39.7°C) | 38.5°C (+0.2) · 300두 | 38.6°C (+0.1) · 52농장 | 38.55°C (+0.15) · 201농장 | +0.05°C |');
    expect(text).toContain('| 반추 | 데이터 없음 | 470분/일 · 10두 | — | 465분/일 · 190농장 | — |');
    expect(text).toContain('- 우군 구성: 총 60두 · 센서 착용 59두 · 착유 44 / 건유 8 / 육성 8 · 평균 산차 2.4 · 착유우 평균 DIM 172일');
    expect(text).toContain('목장 센서 데이터 개체 58/60두');
    expect(text).toContain('품종 기준: jersey');
    expect(text).toContain('지역: 경기 52농장');
    expect(text).toContain('pH·음수량은 별도 볼루스');
  });

  it('개요 메트릭은 체온·활동·반추·음수횟수 4종 (pH·음수량 L 제외)', () => {
    expect([...OVERVIEW_METRICS]).toEqual(['temperature', 'activity', 'rumination', 'drinking']);
  });

  it('우군 구성이 없으면(전국 개요) 구성 줄을 만들지 않는다', () => {
    const text = buildOverviewLines({ ...overview, farmId: null, farmName: null, coverage: { ...overview.coverage, herd: null } }).join('\n');
    expect(text).not.toContain('우군 구성');
    expect(text).toContain('경기)');
  });
});
