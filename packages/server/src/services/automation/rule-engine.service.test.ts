// 자동화 룰 엔진 순수 함수 테스트 — 트리거 매칭, 파라미터 치환, 상태 매핑

import { describe, it, expect } from 'vitest';
import {
  matchesTrigger,
  renderParams,
  runStatusFromGateway,
  AUTOMATABLE_TOOLS,
  type TriggerCandidate,
} from './rule-engine.service.js';

const ALERT: TriggerCandidate = {
  source: 'alert',
  sourceId: 'a1',
  eventType: 'health_warning',
  farmId: 'f1',
  animalId: 'an1',
  priority: 'high',
};

const EVENT: TriggerCandidate = {
  source: 'smaxtec_event',
  sourceId: 'e1',
  eventType: 'heat',
  farmId: 'f1',
  animalId: 'an1',
  confidence: 0.9,
};

describe('matchesTrigger', () => {
  it('소스가 다르면 불일치', () => {
    expect(matchesTrigger({ source: 'smaxtec_event', eventTypes: [] }, ALERT)).toBe(false);
  });

  it('eventTypes 빈 배열 = 전체 매칭', () => {
    expect(matchesTrigger({ source: 'alert', eventTypes: [] }, ALERT)).toBe(true);
  });

  it('eventTypes 지정 시 포함된 유형만', () => {
    expect(matchesTrigger({ source: 'alert', eventTypes: ['health_warning'] }, ALERT)).toBe(true);
    expect(matchesTrigger({ source: 'alert', eventTypes: ['estrus'] }, ALERT)).toBe(false);
  });

  it('minPriority — 이상만 매칭 (low<medium<high<critical)', () => {
    expect(matchesTrigger({ source: 'alert', eventTypes: [], minPriority: 'high' }, ALERT)).toBe(true);
    expect(matchesTrigger({ source: 'alert', eventTypes: [], minPriority: 'critical' }, ALERT)).toBe(false);
    expect(matchesTrigger({ source: 'alert', eventTypes: [], minPriority: 'low' }, ALERT)).toBe(true);
  });

  it('priority 없는 후보는 minPriority 조건에서 제외', () => {
    expect(matchesTrigger(
      { source: 'alert', eventTypes: [], minPriority: 'low' },
      { ...ALERT, priority: undefined },
    )).toBe(false);
  });

  it('minConfidence — smaXtec 이벤트 신뢰도 필터', () => {
    expect(matchesTrigger({ source: 'smaxtec_event', eventTypes: ['heat'], minConfidence: 0.8 }, EVENT)).toBe(true);
    expect(matchesTrigger({ source: 'smaxtec_event', eventTypes: ['heat'], minConfidence: 0.95 }, EVENT)).toBe(false);
  });
});

describe('renderParams', () => {
  it('{{key}} 플레이스홀더를 컨텍스트 값으로 치환', () => {
    expect(renderParams(
      { animalId: '{{animalId}}', note: '{{earTag}}번 발정' },
      { animalId: 'an1', earTag: '423' },
    )).toEqual({ animalId: 'an1', note: '423번 발정' });
  });

  it('숫자/불리언 값은 그대로 통과', () => {
    expect(renderParams({ days: 7, force: true }, {})).toEqual({ days: 7, force: true });
  });

  it('컨텍스트에 없는 키는 원문 유지 (조용한 빈 값 치환 금지)', () => {
    expect(renderParams({ x: '{{unknown}}' }, { animalId: 'an1' })).toEqual({ x: '{{unknown}}' });
  });

  it('null 컨텍스트 값도 원문 유지', () => {
    expect(renderParams({ x: '{{animalId}}' }, { animalId: null })).toEqual({ x: '{{animalId}}' });
  });
});

describe('runStatusFromGateway', () => {
  it('approvalRequired가 최우선 — 승인 대기', () => {
    expect(runStatusFromGateway({ success: false, denied: false, approvalRequired: true })).toBe('pending_approval');
  });

  it('denied → denied', () => {
    expect(runStatusFromGateway({ success: false, denied: true, approvalRequired: false })).toBe('denied');
  });

  it('success → executed, 그 외 → failed', () => {
    expect(runStatusFromGateway({ success: true, denied: false, approvalRequired: false })).toBe('executed');
    expect(runStatusFromGateway({ success: false, denied: false, approvalRequired: false })).toBe('failed');
  });
});

describe('AUTOMATABLE_TOOLS', () => {
  it('처방 도구(schedule_sync_protocol)는 승인 게이트가 있는 경우에만 포함되어야 한다', () => {
    // 회귀 방지: 허용 목록에 기록/처방 도구를 추가할 때 승인 게이트 존재를 확인할 것
    expect(AUTOMATABLE_TOOLS).toContain('schedule_sync_protocol');
    expect(AUTOMATABLE_TOOLS).not.toContain('record_treatment');
    expect(AUTOMATABLE_TOOLS).not.toContain('record_expert_label');
  });
});
