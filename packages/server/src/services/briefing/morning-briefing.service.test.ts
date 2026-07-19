// 아침 브리핑 순수 함수 테스트 — 발송 시간대·본문 구성

import { describe, it, expect } from 'vitest';
import { kstNow, isBriefingWindow, buildBriefingLines } from './morning-briefing.service.js';
import type { DecisionCard } from '@cowtalk/shared';

function card(partial: Partial<DecisionCard>): DecisionCard {
  return {
    id: 'x',
    rank: 1,
    severity: 'high',
    score: 90,
    title: '발열 개체 즉시 확인',
    subject: { earTag: '423' },
    why: ['체온 상승'],
    actionLabel: '개체 확인',
    actionKind: 'animal',
    source: 'smaxtec',
    detectedAt: new Date().toISOString(),
    urgency: 'today',
    ...partial,
  };
}

describe('kstNow', () => {
  it('UTC 21시는 KST 다음날 06시다', () => {
    const { hour, dateStr } = kstNow(new Date('2026-07-18T21:30:00Z'));
    expect(hour).toBe(6);
    expect(dateStr).toBe('2026-07-19');
  });

  it('UTC 00시는 KST 같은날 09시다', () => {
    expect(kstNow(new Date('2026-07-18T00:00:00Z')).hour).toBe(9);
  });
});

describe('isBriefingWindow', () => {
  it('KST 06~07시대만 발송한다', () => {
    expect(isBriefingWindow(6)).toBe(true);
    expect(isBriefingWindow(7)).toBe(true);
    expect(isBriefingWindow(8)).toBe(false);
    expect(isBriefingWindow(5)).toBe(false);
    expect(isBriefingWindow(23)).toBe(false);
  });
});

describe('buildBriefingLines', () => {
  it('카드가 없으면 "이상 없음" 브리핑을 만든다', () => {
    expect(buildBriefingLines([])).toContain('긴급 확인 대상이 없습니다');
  });

  it('카드 3장까지 긴급도·귀번호·제목으로 줄을 만든다', () => {
    const lines = buildBriefingLines([
      card({ urgency: 'emergency', subject: { earTag: '423' }, title: '발열 개체 즉시 확인' }),
      card({ urgency: 'today', subject: { earTag: '517' }, title: '수정 적기 — 오늘 14시' }),
      card({ urgency: 'within_48h', subject: {}, title: '집단 반추 저하 점검' }),
      card({ urgency: 'info', subject: { earTag: '999' }, title: '네 번째는 잘려야 함' }),
    ]);
    expect(lines).toContain('1. [응급] 423번 — 발열 개체 즉시 확인');
    expect(lines).toContain('2. [오늘 조치] 517번');
    expect(lines).toContain('3. [48시간 이내] 농장 —');
    expect(lines).not.toContain('999');
  });
});
