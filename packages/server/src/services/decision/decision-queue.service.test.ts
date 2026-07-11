// Decision Queue 합성 코어 단위 테스트 — 점수화·병합·정렬·상한

import { describe, it, expect } from 'vitest';
import { buildDecisionCards, scoreCandidate, type DecisionCandidate, thiCandidate } from './decision-queue.service.js';

const NOW = new Date('2026-07-09T09:00:00Z').getTime();

function cand(over: Partial<DecisionCandidate>): DecisionCandidate {
  return {
    source: 'smaxtec',
    severity: 'medium',
    confidence: 0.5,
    title: '테스트 조치',
    why: ['근거'],
    animalId: 'a-1',
    earTag: '100',
    farmId: 'f-1',
    farmName: '테스트목장',
    detectedAt: new Date(NOW - 3_600_000).toISOString(), // 1h 전
    ...over,
  };
}

describe('scoreCandidate', () => {
  it('심각도가 높을수록 점수가 높다', () => {
    const base = { now: NOW };
    const critical = scoreCandidate(cand({ severity: 'critical' }), base.now);
    const high = scoreCandidate(cand({ severity: 'high' }), base.now);
    const medium = scoreCandidate(cand({ severity: 'medium' }), base.now);
    expect(critical).toBeGreaterThan(high);
    expect(high).toBeGreaterThan(medium);
  });

  it('골든타임이 임박할수록 가산된다', () => {
    const soon = scoreCandidate(cand({ dueInHours: 2 }), NOW);
    const later = scoreCandidate(cand({ dueInHours: 20 }), NOW);
    const none = scoreCandidate(cand({}), NOW);
    expect(soon).toBeGreaterThan(later);
    expect(later).toBeGreaterThan(none);
  });
});

describe('buildDecisionCards', () => {
  it('점수 내림차순으로 rank를 부여하고 limit을 지킨다', () => {
    const { cards, totalCandidates } = buildDecisionCards(
      [
        cand({ animalId: 'a-1', severity: 'medium' }),
        cand({ animalId: 'a-2', severity: 'critical' }),
        cand({ animalId: 'a-3', severity: 'high' }),
      ],
      { limit: 2, now: NOW },
    );
    expect(totalCandidates).toBe(3);
    expect(cards).toHaveLength(2);
    expect(cards[0]!.subject.animalId).toBe('a-2');
    expect(cards[0]!.rank).toBe(1);
    expect(cards[1]!.subject.animalId).toBe('a-3');
  });

  it('동일 개체는 병합하고 다중 출처 가산 + 근거 결합', () => {
    const { cards, totalCandidates } = buildDecisionCards(
      [
        cand({ animalId: 'a-1', source: 'smaxtec', severity: 'high', why: ['체온 상승'] }),
        cand({ animalId: 'a-1', source: 'sovereign', severity: 'medium', why: ['케토시스 위험'] }),
        cand({ animalId: 'a-2', source: 'smaxtec', severity: 'high', why: ['체온 상승'] }),
      ],
      { limit: 5, now: NOW },
    );
    expect(totalCandidates).toBe(2);
    const merged = cards.find((c) => c.subject.animalId === 'a-1')!;
    // 심각도는 최댓값 유지
    expect(merged.severity).toBe('high');
    // 근거는 결합
    expect(merged.why).toContain('체온 상승');
    expect(merged.why).toContain('케토시스 위험');
    // 두 판단원이 같은 개체 지목 → 단일 출처(a-2)보다 우선
    expect(merged.rank).toBe(1);
  });

  it('개체 없는 후보는 농장+제목 키로 병합된다', () => {
    const { totalCandidates } = buildDecisionCards(
      [
        cand({ animalId: undefined, earTag: undefined, title: '농장 점검', farmId: 'f-1' }),
        cand({ animalId: undefined, earTag: undefined, title: '농장 점검', farmId: 'f-1' }),
        cand({ animalId: undefined, earTag: undefined, title: '농장 점검', farmId: 'f-2' }),
      ],
      { now: NOW },
    );
    expect(totalCandidates).toBe(2);
  });

  it('actionKind: 개체가 있으면 animal, 없으면 farm', () => {
    const { cards } = buildDecisionCards(
      [
        cand({ animalId: 'a-1' }),
        cand({ animalId: undefined, earTag: undefined, title: '농장 점검' }),
      ],
      { now: NOW },
    );
    expect(cards.find((c) => c.subject.animalId === 'a-1')!.actionKind).toBe('animal');
    expect(cards.find((c) => !c.subject.animalId)!.actionKind).toBe('farm');
  });

  it('why는 최대 4개로 제한된다', () => {
    const { cards } = buildDecisionCards(
      [
        cand({ why: ['1', '2', '3'] }),
        cand({ why: ['4', '5', '6'] }),
      ],
      { now: NOW },
    );
    expect(cards[0]!.why.length).toBeLessThanOrEqual(4);
  });
});

describe('thiCandidate — 열스트레스 결정 후보', () => {
  const BASE = {
    temperature: 32.5, humidity: 78, farmId: 'f1', farmName: '해돋이목장',
    now: new Date('2026-07-10T05:30:00Z').getTime(),
  };

  it('추정치(source=estimate)로는 카드를 만들지 않는다 — 정직성', () => {
    expect(thiCandidate({ ...BASE, source: 'estimate', thi: 90 })).toBeNull();
  });

  it('THI 78 미만은 null', () => {
    expect(thiCandidate({ ...BASE, source: 'kma', thi: 77.9 })).toBeNull();
  });

  it('THI 78~83 → high 폭염 대응 카드', () => {
    const c = thiCandidate({ ...BASE, source: 'kma', thi: 80 });
    expect(c).not.toBeNull();
    expect(c!.severity).toBe('high');
    expect(c!.source).toBe('weather');
    expect(c!.title).toContain('폭염 대응');
    expect(c!.why[0]).toContain('THI 80');
    expect(c!.why[0]).toContain('기상청 실측');
  });

  it('THI 84 이상 → critical 긴급 카드', () => {
    const c = thiCandidate({ ...BASE, source: 'kma', thi: 85 });
    expect(c!.severity).toBe('critical');
    expect(c!.title).toContain('긴급');
  });

  it('detectedAt은 시간 단위 절단 — 같은 시간대 카드 ID 안정 (완료 유지)', () => {
    const a = thiCandidate({ ...BASE, source: 'kma', thi: 80, now: new Date('2026-07-10T05:05:00Z').getTime() });
    const b = thiCandidate({ ...BASE, source: 'kma', thi: 80, now: new Date('2026-07-10T05:55:00Z').getTime() });
    expect(a!.detectedAt).toBe(b!.detectedAt);
    expect(a!.detectedAt).toBe('2026-07-10T05:00:00.000Z');
  });
});
