// 알림 매니저 테스트

import { describe, it, expect } from 'vitest';
import {
  extractAlertsFromAnimal,
  extractAlertsFromFarm,
  filterByCooldown,
  sortByPriority,
  getUrgencyHours,
} from '@server/ai-brain/alert/alert-manager';
import { getChannelsForSeverity } from '@server/ai-brain/alert/notification';
import type { AnimalInterpretation, FarmInterpretation } from '@shared/types/interpretation';

describe('extractAlertsFromAnimal', () => {
  it('critical severity → 알림 생성', () => {
    const interpretation: AnimalInterpretation = {
      animalId: 'a1',
      earTag: '312',
      timestamp: new Date(),
      source: 'claude',
      summary: '312번 긴급 건강 이상',
      interpretation: { primary: 'disease:mastitis', secondary: '', confidence: 'high', reasoning: '' },
      risks: [],
      actions: { farmer: '', veterinarian: '', inseminator: '', government_admin: '', quarantine_officer: '', feed_company: '' },
      dataReferences: [],
      severity: 'critical',
      confidence: 'high',
      modelVersion: 'test',
      processingTimeMs: 100,
      v4Analysis: null,
    };

    const alerts = extractAlertsFromAnimal(interpretation);
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.severity).toBe('critical');
  });

  it('low severity → 알림 없음', () => {
    const interpretation: AnimalInterpretation = {
      animalId: 'a1',
      earTag: '312',
      timestamp: new Date(),
      source: 'claude',
      summary: '정상',
      interpretation: { primary: 'normal', secondary: '', confidence: 'high', reasoning: '' },
      risks: [],
      actions: { farmer: '', veterinarian: '', inseminator: '', government_admin: '', quarantine_officer: '', feed_company: '' },
      dataReferences: [],
      severity: 'low',
      confidence: 'high',
      modelVersion: 'test',
      processingTimeMs: 100,
      v4Analysis: null,
    };

    const alerts = extractAlertsFromAnimal(interpretation);
    expect(alerts.length).toBe(0);
  });
});

describe('extractAlertsFromFarm', () => {
  it('high severity farm + animal highlights → 알림', () => {
    const interpretation: FarmInterpretation = {
      farmId: 'f1',
      farmName: '농장A',
      timestamp: new Date(),
      source: 'claude',
      summary: '농장 위험',
      healthScore: 40,
      todayPriorities: [],
      animalHighlights: [
        { animalId: 'a1', earTag: '312', issue: '발열', severity: 'critical', suggestedAction: '수의사 호출' },
      ],
      risks: [],
      actions: { farmer: '', veterinarian: '', inseminator: '', government_admin: '', quarantine_officer: '', feed_company: '' },
      dataReferences: [],
      severity: 'high',
      modelVersion: 'test',
      processingTimeMs: 100,
    };

    const alerts = extractAlertsFromFarm(interpretation);
    expect(alerts.length).toBe(2); // farm + animal
  });
});

describe('filterByCooldown', () => {
  it('새로운 알림 → 통과', () => {
    const alerts = [
      { type: 'health_risk', animalId: 'a99', farmId: 'f1', severity: 'high' as const, message: 'test', source: 'claude' as const, dedupKey: 'unique-key-99' },
    ];
    const filtered = filterByCooldown(alerts);
    expect(filtered.length).toBe(1);
  });
});

describe('sortByPriority', () => {
  it('critical > high > medium > low', () => {
    const alerts = [
      { type: 't', animalId: null, farmId: 'f1', severity: 'low' as const, message: '', source: 'claude' as const, dedupKey: 'k1' },
      { type: 't', animalId: null, farmId: 'f1', severity: 'critical' as const, message: '', source: 'claude' as const, dedupKey: 'k2' },
      { type: 't', animalId: null, farmId: 'f1', severity: 'medium' as const, message: '', source: 'claude' as const, dedupKey: 'k3' },
    ];

    const sorted = sortByPriority(alerts);
    expect(sorted[0]!.severity).toBe('critical');
    expect(sorted[1]!.severity).toBe('medium');
    expect(sorted[2]!.severity).toBe('low');
  });
});

describe('getUrgencyHours', () => {
  it('critical → 2시간', () => {
    expect(getUrgencyHours('critical')).toBe(2);
  });

  it('high → 6시간', () => {
    expect(getUrgencyHours('high')).toBe(6);
  });

  it('low → 24시간', () => {
    expect(getUrgencyHours('low')).toBe(24);
  });
});

describe('getChannelsForSeverity', () => {
  it('critical → 3채널', () => {
    const channels = getChannelsForSeverity('critical');
    expect(channels).toContain('in_app');
    expect(channels).toContain('email');
    expect(channels).toContain('sms');
  });

  it('medium → in_app만', () => {
    const channels = getChannelsForSeverity('medium');
    expect(channels).toEqual(['in_app']);
  });
});
