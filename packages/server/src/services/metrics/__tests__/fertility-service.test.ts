// fertility-service 순수 함수 테스트 — DB 의존성 없음.
// metrics-contract.md §6.1 / Decision Log D1·D2·D5 / BUG-001

import { describe, it, expect } from 'vitest';
import {
  computeCR,
  computeCRFromCounts,
  decisionsFromPregnancyChecks,
  decisionsFromSmaxtecPregnancyEvents,
  decisionsFromBreedingEventCounts,
} from '../fertility-service.js';

describe('computeCR', () => {
  it('빈 입력 → rate=null + displayValue="—" + status="data_insufficient" (D5 빈 농장)', () => {
    expect(computeCR([])).toEqual({
      numerator: 0,
      denominator: 0,
      rate: null,
      displayValue: '—',
      status: 'data_insufficient',
    });
  });

  it('5 임신 + 5 공태 → 50%', () => {
    const decisions = [
      ...Array.from({ length: 5 }, () => ({ pregnant: true })),
      ...Array.from({ length: 5 }, () => ({ pregnant: false })),
    ];
    expect(computeCR(decisions)).toEqual({
      numerator: 5, denominator: 10, rate: 50, displayValue: '50.0%', status: 'ok',
    });
  });

  it('83 임신 + 17 공태 → 83% (/breeding 의 정답 재현)', () => {
    const decisions = [
      ...Array.from({ length: 83 }, () => ({ pregnant: true })),
      ...Array.from({ length: 17 }, () => ({ pregnant: false })),
    ];
    expect(computeCR(decisions)).toEqual({
      numerator: 83, denominator: 100, rate: 83, displayValue: '83.0%', status: 'ok',
    });
  });

  it('100% 임신 → rate=100', () => {
    const decisions = Array.from({ length: 7 }, () => ({ pregnant: true }));
    expect(computeCR(decisions)).toEqual({
      numerator: 7, denominator: 7, rate: 100, displayValue: '100.0%', status: 'ok',
    });
  });

  it('전부 공태 → rate=0 (실값. status="ok", "—"와 구별)', () => {
    const decisions = Array.from({ length: 4 }, () => ({ pregnant: false }));
    expect(computeCR(decisions)).toEqual({
      numerator: 0, denominator: 4, rate: 0, displayValue: '0.0%', status: 'ok',
    });
  });

  it('단일 케이스 (1/1) → 100', () => {
    expect(computeCR([{ pregnant: true }])).toEqual({
      numerator: 1, denominator: 1, rate: 100, displayValue: '100.0%', status: 'ok',
    });
  });

  it('11 수정 / 13 임신확정 시나리오 (PR #32 113% 버그가 다시 살아나지 않음)', () => {
    // smaXtec이 재확인 이벤트를 보내도 분자가 분모를 초과할 수 없다 — 같은 풀에서 옴.
    // 13 임신 + 0 공태 = decided 13 → 100%. 절대 113% 안 됨.
    const decisions = Array.from({ length: 13 }, () => ({ pregnant: true }));
    const result = computeCR(decisions);
    expect(result.rate).toBeLessThanOrEqual(100);
    expect(result.rate).toBe(100);
    expect(result.status).toBe('ok');
  });
});

describe('D5 displayValue/status 분기 (rate=0 vs rate=null 구별)', () => {
  it('실값 0% (분모 있음) → status="ok", displayValue="0.0%" — "데이터 부족" 아님', () => {
    // 실제 농장에서 수정만 하고 임신 0인 경우. "—"가 아니라 0% 표시 정답.
    const decisions = Array.from({ length: 10 }, () => ({ pregnant: false }));
    const result = computeCR(decisions);
    expect(result.rate).toBe(0);
    expect(result.status).toBe('ok');
    expect(result.displayValue).toBe('0.0%');
    expect(result.displayValue).not.toBe('—');
  });

  it('빈 농장 (분모 없음) → status="data_insufficient", displayValue="—" — 0%과 구별', () => {
    // 아직 임신감정 안 한 신규 농장. 0%로 표시되면 D5 위반.
    const decisions: { pregnant: boolean }[] = [];
    const result = computeCR(decisions);
    expect(result.rate).toBeNull();
    expect(result.status).toBe('data_insufficient');
    expect(result.displayValue).toBe('—');
    expect(result.displayValue).not.toBe('0%');
    expect(result.displayValue).not.toBe('0.0%');
  });

  it('pending만 있는 농장 (decided=0) → "—" (D2 + D5 결합)', () => {
    // pending이 분모에서 제외되므로 decided=0 → 빈 농장 취급 → "—"
    const decisions = decisionsFromPregnancyChecks([
      { result: 'pending' },
      { result: 'pending' },
      { result: 'inconclusive' },
    ]);
    expect(decisions.length).toBe(0);
    const result = computeCR(decisions);
    expect(result.status).toBe('data_insufficient');
    expect(result.displayValue).toBe('—');
  });

  it('computeCRFromCounts(0,0) → displayValue="—", status="data_insufficient"', () => {
    const result = computeCRFromCounts(0, 0);
    expect(result.rate).toBeNull();
    expect(result.displayValue).toBe('—');
    expect(result.status).toBe('data_insufficient');
  });
});

describe('computeCRFromCounts', () => {
  it('카운트 0/0 → rate=null + displayValue="—" + status="data_insufficient"', () => {
    expect(computeCRFromCounts(0, 0)).toEqual({
      numerator: 0, denominator: 0, rate: null, displayValue: '—', status: 'data_insufficient',
    });
  });

  it('5/10 → 50', () => {
    expect(computeCRFromCounts(5, 10)).toEqual({
      numerator: 5, denominator: 10, rate: 50, displayValue: '50.0%', status: 'ok',
    });
  });

  it('분자가 분모보다 큰 비정상 입력 → 분모로 자동 클램프 (>100% 차단)', () => {
    // 데이터 무결성 위반 케이스. 100% 초과 절대 불가.
    const result = computeCRFromCounts(15, 10);
    expect(result.rate).toBe(100);
    expect(result.numerator).toBe(10);
  });

  it('음수 분자 입력 → 0으로 클램프', () => {
    expect(computeCRFromCounts(-3, 10)).toEqual({
      numerator: 0, denominator: 10, rate: 0, displayValue: '0.0%', status: 'ok',
    });
  });

  it('음수 분모 → null', () => {
    const result = computeCRFromCounts(0, -5);
    expect(result.rate).toBeNull();
  });

  it('NaN 입력 → null (Number.isFinite 가드)', () => {
    expect(computeCRFromCounts(Number.NaN, 10).rate).toBeNull();
    expect(computeCRFromCounts(5, Number.NaN).rate).toBeNull();
  });
});

describe('decisionsFromPregnancyChecks', () => {
  it('pregnant/open/not_pregnant 만 결정에 포함, pending 제외 (D2)', () => {
    const rows = [
      { result: 'pregnant' },
      { result: 'open' },
      { result: 'not_pregnant' },
      { result: 'pending' },         // 제외
      { result: 'inconclusive' },    // 제외
      { result: null },              // 제외
    ];
    const decisions = decisionsFromPregnancyChecks(rows);
    expect(decisions.length).toBe(3);
    expect(decisions.filter((d) => d.pregnant).length).toBe(1);
    expect(decisions.filter((d) => !d.pregnant).length).toBe(2);
  });

  it('빈 입력 → 빈 배열', () => {
    expect(decisionsFromPregnancyChecks([])).toEqual([]);
  });
});

describe('decisionsFromSmaxtecPregnancyEvents', () => {
  it('pregnancy_check 이벤트 + details.pregnant boolean 만 결정에 포함', () => {
    const events = [
      { eventType: 'pregnancy_check', details: { pregnant: true } },
      { eventType: 'pregnancy_check', details: { pregnant: false } },
      { eventType: 'pregnancy_check', details: { pregnant: 'maybe' } }, // 제외 (boolean 아님)
      { eventType: 'pregnancy_check', details: null },                  // 제외
      { eventType: 'pregnancy_check', details: {} },                    // 제외 (pregnant 없음)
      { eventType: 'estrus', details: { pregnant: true } },             // 제외 (eventType)
    ];
    const decisions = decisionsFromSmaxtecPregnancyEvents(events);
    expect(decisions.length).toBe(2);
    expect(decisions[0]?.pregnant).toBe(true);
    expect(decisions[1]?.pregnant).toBe(false);
  });
});

describe('decisionsFromBreedingEventCounts', () => {
  it('pregnancy_confirmed/pregnancy_check → true, pregnancy_failed/not_pregnant/open → false', () => {
    const rows = [
      { type: 'pregnancy_confirmed', cnt: 3 },
      { type: 'pregnancy_check', cnt: 2 },
      { type: 'pregnancy_failed', cnt: 1 },
      { type: 'not_pregnant', cnt: 4 },
      { type: 'open', cnt: 2 },
      { type: 'insemination', cnt: 10 }, // 제외 (감정 아님)
      { type: 'estrus', cnt: 5 },        // 제외
    ];
    const decisions = decisionsFromBreedingEventCounts(rows);
    expect(decisions.length).toBe(3 + 2 + 1 + 4 + 2); // 12
    expect(decisions.filter((d) => d.pregnant).length).toBe(5);
    expect(decisions.filter((d) => !d.pregnant).length).toBe(7);
  });

  it('cnt 0 또는 음수 → 제외', () => {
    const rows = [
      { type: 'pregnancy_confirmed', cnt: 0 },
      { type: 'pregnancy_failed', cnt: -1 },
      { type: 'pregnancy_confirmed', cnt: 5 },
    ];
    const decisions = decisionsFromBreedingEventCounts(rows);
    expect(decisions.length).toBe(5);
    expect(decisions.every((d) => d.pregnant)).toBe(true);
  });
});

describe('End-to-end: extract → compute', () => {
  it('pregnancyChecks 표본 → 83% 재현 (decided 기준)', () => {
    // 83 pregnant + 17 open + 999 pending = decided 100, rate 83
    const rows: Array<{ result: string }> = [
      ...Array.from({ length: 83 }, () => ({ result: 'pregnant' })),
      ...Array.from({ length: 17 }, () => ({ result: 'open' })),
      ...Array.from({ length: 999 }, () => ({ result: 'pending' })), // 노이즈, 분모 안 들어감
    ];
    const decisions = decisionsFromPregnancyChecks(rows);
    const cr = computeCR(decisions);
    expect(cr.numerator).toBe(83);
    expect(cr.denominator).toBe(100);
    expect(cr.rate).toBe(83);
  });

  it('smaXtec + 수동 병합 (breeding-performance 패턴) → 같은 농장이 동일 값', () => {
    const smaxtecEvents = [
      { eventType: 'pregnancy_check', details: { pregnant: true } },
      { eventType: 'pregnancy_check', details: { pregnant: false } },
    ];
    const manualChecks = [{ result: 'pregnant' }, { result: 'open' }];

    const merged = [
      ...decisionsFromSmaxtecPregnancyEvents(smaxtecEvents),
      ...decisionsFromPregnancyChecks(manualChecks),
    ];
    const cr = computeCR(merged);
    expect(cr).toEqual({
      numerator: 2, denominator: 4, rate: 50, displayValue: '50.0%', status: 'ok',
    });
  });
});
