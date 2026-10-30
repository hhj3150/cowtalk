// 케이스 순수 규칙 테스트 — 상태 전이·플래그·정렬·집계

import { describe, it, expect } from 'vitest';
import {
  statusAfterEvent,
  canAppendEvent,
  computeCaseFlags,
  sortCases,
  summarizeCases,
  caseSortKey,
  RECHECK_DUE_HOURS,
  type CaseFlagInput,
  type CaseListItem,
  type CaseStatus,
} from '../types/case.js';

const NOW = new Date('2026-09-17T09:00:00+09:00');

function flagInput(over: Partial<CaseFlagInput> = {}): CaseFlagInput {
  return {
    status: 'assigned',
    currentAssigneeId: 'user-1',
    dueAt: null,
    lastTreatmentAt: null,
    lastRecheckAt: null,
    outcome: null,
    ...over,
  };
}

describe('statusAfterEvent', () => {
  it('감지 상태에서 배정하면 assigned 로 간다', () => {
    expect(statusAfterEvent('detected', 'assigned')).toBe('assigned');
  });

  it('진행된 케이스를 재배정해도 진척을 뒤로 돌리지 않는다', () => {
    expect(statusAfterEvent('treated', 'reassigned')).toBeNull();
    expect(statusAfterEvent('field_checked', 'assigned')).toBeNull();
  });

  it('현장확인·조치·재확인은 각 단계로 전진시킨다', () => {
    expect(statusAfterEvent('assigned', 'field_check')).toBe('field_checked');
    expect(statusAfterEvent('field_checked', 'treatment')).toBe('treated');
    expect(statusAfterEvent('treated', 'recheck')).toBe('rechecking');
  });

  it('배정을 건너뛰고 현장확인부터 해도 받아준다 (현장 현실)', () => {
    expect(statusAfterEvent('detected', 'field_check')).toBe('field_checked');
  });

  it('종료된 케이스는 재개 외에는 상태가 바뀌지 않는다', () => {
    expect(statusAfterEvent('closed', 'treatment')).toBeNull();
    expect(statusAfterEvent('closed', 'field_check')).toBeNull();
    expect(statusAfterEvent('closed', 'reopened')).toBe('rechecking');
  });

  it('메모는 상태를 바꾸지 않는다', () => {
    expect(statusAfterEvent('assigned', 'note')).toBeNull();
  });

  it('재확인 중에도 다시 조치할 수 있다 (악화 시 재처치)', () => {
    expect(statusAfterEvent('rechecking', 'treatment')).toBe('treated');
  });
});

describe('canAppendEvent', () => {
  it('열린 케이스에는 무엇이든 기록할 수 있다', () => {
    const types = ['field_check', 'treatment', 'recheck', 'note'] as const;
    for (const t of types) {
      expect(canAppendEvent('assigned', t)).toBe(true);
    }
  });

  it('종료된 케이스에는 재개와 메모만 붙는다', () => {
    expect(canAppendEvent('closed', 'reopened')).toBe(true);
    expect(canAppendEvent('closed', 'note')).toBe(true);
    expect(canAppendEvent('closed', 'treatment')).toBe(false);
    expect(canAppendEvent('closed', 'recheck')).toBe(false);
  });
});

describe('computeCaseFlags', () => {
  it('담당자가 없으면 미배정', () => {
    expect(computeCaseFlags(flagInput({ currentAssigneeId: null }), NOW)).toContain('unassigned');
  });

  it('기한이 지나면 기한 초과', () => {
    const past = new Date(NOW.getTime() - 60_000).toISOString();
    expect(computeCaseFlags(flagInput({ dueAt: past }), NOW)).toContain('overdue');
  });

  it('기한이 남아 있으면 기한 초과가 아니다', () => {
    const future = new Date(NOW.getTime() + 60_000).toISOString();
    expect(computeCaseFlags(flagInput({ dueAt: future }), NOW)).not.toContain('overdue');
  });

  it('조치 후 재확인 없이 기준 시간이 지나면 재확인 누락', () => {
    const treated = new Date(NOW.getTime() - (RECHECK_DUE_HOURS + 1) * 3_600_000).toISOString();
    expect(computeCaseFlags(flagInput({ lastTreatmentAt: treated }), NOW)).toContain('recheck_missing');
  });

  it('조치 직후에는 재확인 누락으로 몰아붙이지 않는다', () => {
    const treated = new Date(NOW.getTime() - 3_600_000).toISOString();
    expect(computeCaseFlags(flagInput({ lastTreatmentAt: treated }), NOW)).not.toContain('recheck_missing');
  });

  it('재확인이 조치보다 먼저면 누락으로 본다 (이전 재확인은 이번 조치를 확인하지 못한다)', () => {
    const treated = new Date(NOW.getTime() - (RECHECK_DUE_HOURS + 1) * 3_600_000).toISOString();
    const recheckedEarlier = new Date(new Date(treated).getTime() - 3_600_000).toISOString();
    expect(
      computeCaseFlags(flagInput({ lastTreatmentAt: treated, lastRecheckAt: recheckedEarlier }), NOW),
    ).toContain('recheck_missing');
  });

  it('조치 후 재확인이 있으면 누락이 아니다', () => {
    const treated = new Date(NOW.getTime() - (RECHECK_DUE_HOURS + 5) * 3_600_000).toISOString();
    const rechecked = new Date(new Date(treated).getTime() + 3_600_000).toISOString();
    expect(
      computeCaseFlags(flagInput({ lastTreatmentAt: treated, lastRecheckAt: rechecked }), NOW),
    ).not.toContain('recheck_missing');
  });

  it('악화가 관측되면 악화 플래그', () => {
    expect(computeCaseFlags(flagInput({ worsenedObserved: true }), NOW)).toContain('worsened');
  });

  it('종료된 케이스는 기한 초과·미배정으로 목록을 어지럽히지 않는다', () => {
    const past = new Date(NOW.getTime() - 86_400_000).toISOString();
    const flags = computeCaseFlags(
      flagInput({ status: 'closed', currentAssigneeId: null, dueAt: past, outcome: 'improved' }),
      NOW,
    );
    expect(flags).toEqual([]);
  });

  it('악화로 종료된 건은 악화 표시를 남긴다', () => {
    const flags = computeCaseFlags(flagInput({ status: 'closed', outcome: 'worsened' }), NOW);
    expect(flags).toEqual(['worsened']);
  });

  it('잘못된 날짜 문자열은 플래그를 만들지 않는다', () => {
    const flags = computeCaseFlags(flagInput({ dueAt: 'not-a-date', lastTreatmentAt: 'nope' }), NOW);
    expect(flags).not.toContain('overdue');
    expect(flags).not.toContain('recheck_missing');
  });
});

describe('caseSortKey / sortCases', () => {
  const base = { detectedAt: '2026-09-17T00:00:00.000Z' };

  it('놓친 건(악화·기한초과)이 심각도보다 앞선다', () => {
    const items = [
      { id: 'critical-clean', severity: 'critical' as const, flags: [], ...base },
      { id: 'low-overdue', severity: 'low' as const, flags: ['overdue' as const], ...base },
    ];
    expect(sortCases(items).map((i) => i.id)).toEqual(['low-overdue', 'critical-clean']);
  });

  it('같은 플래그면 심각도 순', () => {
    const items = [
      { id: 'medium', severity: 'medium' as const, flags: ['overdue' as const], ...base },
      { id: 'high', severity: 'high' as const, flags: ['overdue' as const], ...base },
    ];
    expect(sortCases(items).map((i) => i.id)).toEqual(['high', 'medium']);
  });

  it('같은 플래그·심각도면 최신 감지가 먼저', () => {
    const items = [
      { id: 'old', severity: 'high' as const, flags: [], detectedAt: '2026-09-01T00:00:00.000Z' },
      { id: 'new', severity: 'high' as const, flags: [], detectedAt: '2026-09-16T00:00:00.000Z' },
    ];
    expect(sortCases(items).map((i) => i.id)).toEqual(['new', 'old']);
  });

  it('원본 배열을 바꾸지 않는다', () => {
    const items = [
      { id: 'a', severity: 'low' as const, flags: [], ...base },
      { id: 'b', severity: 'critical' as const, flags: [], ...base },
    ];
    const before = items.map((i) => i.id);
    sortCases(items);
    expect(items.map((i) => i.id)).toEqual(before);
  });

  it('악화가 기한 초과보다 앞선다', () => {
    const worsened = caseSortKey({ severity: 'low', flags: ['worsened'], ...base });
    const overdue = caseSortKey({ severity: 'critical', flags: ['overdue'], ...base });
    expect(worsened[0]).toBeLessThan(overdue[0]);
  });
});

describe('summarizeCases', () => {
  function item(status: CaseStatus, flags: CaseListItem['flags']): CaseListItem {
    return {
      caseId: `c-${status}-${flags.join('')}`,
      farmId: 'f1',
      farmName: '술탄목장',
      animalId: null,
      earTag: null,
      source: 'decision_card',
      sourceRef: null,
      severity: 'high',
      status,
      title: 't',
      detectedSignals: [],
      detectedAt: NOW.toISOString(),
      ownerId: null,
      ownerName: null,
      currentAssigneeId: null,
      currentAssigneeName: null,
      dueAt: null,
      lastFieldCheckAt: null,
      lastTreatmentAt: null,
      lastRecheckAt: null,
      closedAt: null,
      outcome: null,
      outcomeNotes: '',
      outcomeSnapshot: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      flags,
    };
  }

  it('열린 건과 종료 건을 나눠 센다', () => {
    const s = summarizeCases([
      item('detected', ['unassigned']),
      item('treated', ['recheck_missing']),
      item('closed', []),
    ]);
    expect(s.total).toBe(3);
    expect(s.open).toBe(2);
    expect(s.closed).toBe(1);
    expect(s.unassigned).toBe(1);
    expect(s.recheckMissing).toBe(1);
    expect(s.byStatus.detected).toBe(1);
    expect(s.byStatus.closed).toBe(1);
  });

  it('한 건이 플래그를 여러 개 가지면 각각에 집계된다', () => {
    const s = summarizeCases([item('assigned', ['unassigned', 'overdue'])]);
    expect(s.unassigned).toBe(1);
    expect(s.overdue).toBe(1);
    expect(s.total).toBe(1);
  });

  it('빈 목록은 0으로 떨어진다', () => {
    const s = summarizeCases([]);
    expect(s.total).toBe(0);
    expect(s.open).toBe(0);
    expect(s.byStatus.rechecking).toBe(0);
  });
});
