import { describe, it, expect } from 'vitest';
import {
  verifyLoop,
  buildEpisodes,
  linkInterventions,
  isFinalVerdict,
  ratio,
  type DailyPoint,
  type DetectionEvent,
} from '../closed-loop-engine.js';
import {
  resolveProtocol,
  protocolByKey,
  summarizeProtocol,
  CLOSED_LOOP_PROTOCOLS,
  GENERAL_PROTOCOL,
} from '../closed-loop-protocols.js';

const H = 3600_000;


/** 날짜 문자열 → 3개 메트릭 포인트 */
function day(date: string, temp: number | null, rum: number | null, act: number | null): DailyPoint[] {
  const out: DailyPoint[] = [];
  if (temp !== null) out.push({ date, metricType: 'temperature', avg: temp });
  if (rum !== null) out.push({ date, metricType: 'rumination', avg: rum });
  if (act !== null) out.push({ date, metricType: 'activity', avg: act });
  return out;
}

// 감지 11-01 10:00, 처치 11-01 12:00 기준
const detect = new Date('2026-11-01T10:00:00Z');
const treat = new Date('2026-11-01T12:00:00Z');
const baseline = [
  ...day('2026-10-29', 38.9, 500, 100),
  ...day('2026-10-30', 38.9, 500, 100),
  ...day('2026-10-31', 38.9, 500, 100),
];

describe('resolveProtocol — 진단명 → 프로토콜', () => {
  it('한국어·영문 키워드를 인식한다', () => {
    expect(resolveProtocol('케토시스 (임상형)').key).toBe('ketosis');
    expect(resolveProtocol('Ketosis').key).toBe('ketosis');
    expect(resolveProtocol('유열 의심').key).toBe('hypocalcemia');
    expect(resolveProtocol('우전 유방염 CMT++').key).toBe('mastitis');
    expect(resolveProtocol('폐렴').key).toBe('fever_infection');
    expect(resolveProtocol('제4위변위').key).toBe('digestive');
  });
  it('모르는 진단·빈 값은 일반 프로토콜', () => {
    expect(resolveProtocol('').key).toBe('general');
    expect(resolveProtocol(null).key).toBe('general');
    expect(resolveProtocol('원인 불명').key).toBe('general');
    expect(protocolByKey('nope')).toBe(GENERAL_PROTOCOL);
  });
  it('모든 프로토콜은 회복 기준·개입 후보를 갖고 요약 가능하다', () => {
    for (const p of CLOSED_LOOP_PROTOCOLS) {
      expect(p.primary.length).toBeGreaterThan(0);
      expect(p.interventions.length).toBeGreaterThan(0);
      expect(summarizeProtocol(p).criteriaText.length).toBe(p.primary.length + p.worsen.length);
    }
  });
  it('체내 방출형 볼루스 후보는 보충제만 (치료제 자동투여 가설 금지)', () => {
    for (const p of CLOSED_LOOP_PROTOCOLS) {
      for (const i of p.interventions) {
        if (i.futureBolusCandidate) {
          expect(i.category).toBe('supplement');
          expect(i.requiresVet).toBe(false);
        }
      }
    }
  });
});

describe('verifyLoop — 센서 검증', () => {
  const fever = protocolByKey('fever_infection'); // 24h 후 시작, 72h 창

  it('검증 시작 전에는 awaiting — 투여 직후 판정 금지', () => {
    const v = verifyLoop({ protocol: fever, interventionAt: treat, anchorAt: detect, points: baseline, now: new Date(treat.getTime() + 6 * H) });
    expect(v.verdict).toBe('awaiting');
    expect(v.windowComplete).toBe(false);
  });

  it('기준선은 감지 전날까지만 — 감지 당일·처치 후 데이터가 섞이지 않는다', () => {
    const points = [...baseline, ...day('2026-11-01', 40.5, 200, 50)];
    const v = verifyLoop({ protocol: fever, interventionAt: treat, anchorAt: detect, points, now: new Date("2026-11-03T20:00:00Z") });
    expect(v.baseline.temp).toBe(38.9);
    expect(v.baseline.rumination).toBe(500);
    expect(v.baseline.days).toBe(3);
  });

  it('체온 정상화 + 반추 +10% → resolved', () => {
    const points = [
      ...baseline,
      ...day('2026-11-02', 39.6, 480, 95),
      ...day('2026-11-03', 39.1, 560, 100),
      ...day('2026-11-04', 39.0, 570, 105),
    ];
    const v = verifyLoop({ protocol: fever, interventionAt: treat, anchorAt: detect, points, now: new Date('2026-11-05T13:00:00Z') });
    expect(v.verdict).toBe('resolved');
    expect(v.windowComplete).toBe(true);
    expect(v.metCriteria.length).toBe(2);
    expect(isFinalVerdict(v.verdict)).toBe(true);
    expect(v.contributingFactors.some((f) => f.includes('체온'))).toBe(true);
  });

  it('최근 2일 평균 > 39.8°C → worsened (회복 기준보다 우선)', () => {
    const points = [...baseline, ...day('2026-11-02', 40.0, 560, 100), ...day('2026-11-03', 40.1, 560, 100)];
    const v = verifyLoop({ protocol: fever, interventionAt: treat, anchorAt: detect, points, now: new Date('2026-11-03T20:00:00Z') });
    expect(v.verdict).toBe('worsened');
    expect(v.nextAction).toContain('재진');
  });

  it('일부만 충족 → improving', () => {
    const points = [...baseline, ...day('2026-11-02', 39.1, 480, 100), ...day('2026-11-03', 39.0, 490, 100)];
    const v = verifyLoop({ protocol: fever, interventionAt: treat, anchorAt: detect, points, now: new Date('2026-11-03T20:00:00Z') });
    expect(v.verdict).toBe('improving');
    expect(v.unmetCriteria.length).toBe(1);
  });

  it('창 진행 중 미충족은 monitoring, 창 종료 후 미충족은 not_improved', () => {
    const points = [...baseline, ...day('2026-11-02', 39.5, 480, 100), ...day('2026-11-03', 39.6, 470, 100), ...day('2026-11-04', 39.5, 470, 100)];
    const mid = verifyLoop({ protocol: fever, interventionAt: treat, anchorAt: detect, points, now: new Date('2026-11-03T20:00:00Z') });
    expect(mid.verdict).toBe('monitoring');
    const end = verifyLoop({ protocol: fever, interventionAt: treat, anchorAt: detect, points, now: new Date('2026-11-06T00:00:00Z') });
    expect(end.verdict).toBe('not_improved');
  });

  it('센서값이 없으면 창 종료 시 insufficient_data', () => {
    const v = verifyLoop({ protocol: fever, interventionAt: treat, anchorAt: detect, points: [], now: new Date('2026-11-06T00:00:00Z') });
    expect(v.verdict).toBe('insufficient_data');
  });

  it('기준선이 없으면 비율 기준은 판정 불가로 남기고 절대 기준만으로 판정', () => {
    const points = [...day('2026-11-02', 39.0, 560, 100), ...day('2026-11-03', 39.0, 560, 100)];
    const v = verifyLoop({ protocol: fever, interventionAt: treat, anchorAt: detect, points, now: new Date('2026-11-03T20:00:00Z') });
    expect(v.verdict).toBe('resolved');
    expect(v.contributingFactors.some((f) => f.includes('기준선'))).toBe(true);
    expect(v.contributingFactors.some((f) => f.includes('판정 불가'))).toBe(true);
  });

  it('케토시스: 반추 15% 이상 추가 감소 → worsened', () => {
    const ketosis = protocolByKey('ketosis');
    const points = [...baseline, ...day('2026-11-02', 38.9, 400, 90), ...day('2026-11-03', 38.9, 410, 90)];
    const v = verifyLoop({ protocol: ketosis, interventionAt: treat, anchorAt: detect, points, now: new Date('2026-11-03T20:00:00Z') });
    expect(v.verdict).toBe('worsened');
    expect(v.contributingFactors.some((f) => f.includes('BHB'))).toBe(true);
  });

  it('유열: 저체온 회복 + 반추 회복 → resolved, 38.0 미만 지속 → worsened', () => {
    const hypo = protocolByKey('hypocalcemia'); // 12h 후 시작
    const ok = [...baseline, ...day('2026-11-02', 38.6, 510, 100), ...day('2026-11-03', 38.7, 520, 100)];
    expect(verifyLoop({ protocol: hypo, interventionAt: treat, anchorAt: detect, points: ok, now: new Date('2026-11-03T20:00:00Z') }).verdict).toBe('resolved');
    const bad = [...baseline, ...day('2026-11-02', 37.8, 300, 60), ...day('2026-11-03', 37.7, 300, 60)];
    expect(verifyLoop({ protocol: hypo, interventionAt: treat, anchorAt: detect, points: bad, now: new Date('2026-11-03T20:00:00Z') }).verdict).toBe('worsened');
  });
});

describe('buildEpisodes / linkInterventions — 감지↔개입 연결', () => {
  const ev = (animalId: string, iso: string, eventType = 'temperature_high', severity = 'medium'): DetectionEvent => ({
    animalId, eventType, severity, detectedAt: new Date(iso), acknowledged: false,
  });

  it('같은 개체 72h 이내 감지는 한 에피소드로 병합, 심각도는 최대값', () => {
    const eps = buildEpisodes([
      ev('a', '2026-11-01T00:00:00Z'),
      ev('a', '2026-11-02T00:00:00Z', 'rumination_decrease', 'high'),
      ev('a', '2026-11-10T00:00:00Z'),
      ev('b', '2026-11-01T00:00:00Z'),
    ]);
    expect(eps.length).toBe(3);
    const first = eps.find((e) => e.animalId === 'a' && e.startAt.toISOString().startsWith('2026-11-01'))!;
    expect(first.eventTypes).toEqual(['temperature_high', 'rumination_decrease']);
    expect(first.severity).toBe('high');
  });

  it('감지 12h 전 ~ 마지막 감지 72h 후 처치는 연결, 범위 밖·다른 개체는 미연결', () => {
    const eps = buildEpisodes([ev('a', '2026-11-01T12:00:00Z'), ev('b', '2026-11-01T12:00:00Z'), ev('c', '2026-11-01T12:00:00Z')]);
    const link = linkInterventions(eps, [
      { id: 't1', animalId: 'a', at: new Date('2026-11-01T02:00:00Z') }, // 10h 전 — 연결
      { id: 't2', animalId: 'b', at: new Date('2026-11-05T12:00:00Z') }, // 96h 후 — 미연결
      { id: 't3', animalId: 'z', at: new Date('2026-11-01T13:00:00Z') }, // 다른 개체
    ]);
    expect(link.anchorByIntervention.get('t1')?.toISOString()).toBe('2026-11-01T12:00:00.000Z');
    expect(link.anchorByIntervention.has('t2')).toBe(false);
    expect(link.anchorByIntervention.has('t3')).toBe(false);
    expect(link.intervenedEpisodes.map((e) => e.animalId)).toEqual(['a']);
    expect(link.openEpisodes.map((e) => e.animalId).sort()).toEqual(['b', 'c']);
  });

  it('ratio: 분모 0이면 null', () => {
    expect(ratio(1, 0)).toBeNull();
    expect(ratio(1, 3)).toBe(0.333);
  });
});
