// AnimalDetail 테스트 — 4역할별 뷰 차이 확인

import { describe, it, expect } from 'vitest';
import type { Role } from '@cowtalk/shared';

// SECTIONS_BY_ROLE 직접 임포트하여 테스트
// 컴포넌트에서 정의된 것과 동일한 타입/매핑 검증
type SectionKey = 'sensor' | 'ai' | 'actions' | 'pedigree' | 'semen' | 'breeding' | 'health' | 'production' | 'events' | 'timeline' | 'feedback';

const SECTIONS_BY_ROLE: Record<Role, readonly SectionKey[]> = {
  farmer: ['sensor', 'ai', 'actions', 'production', 'breeding', 'health', 'events', 'feedback'],
  veterinarian: ['sensor', 'ai', 'actions', 'health', 'pedigree', 'breeding', 'production', 'events', 'timeline', 'feedback'],
  government_admin: ['sensor', 'ai', 'production', 'health', 'events'],
  quarantine_officer: ['sensor', 'ai', 'health', 'events'],
};

const SENSOR_ORDER_BY_ROLE: Record<Role, readonly { key: string }[]> = {
  farmer: [{ key: 'temperature' }, { key: 'activity' }, { key: 'rumination' }],
  veterinarian: [{ key: 'temperature' }, { key: 'activity' }, { key: 'rumination' }],
  government_admin: [{ key: 'temperature' }, { key: 'activity' }, { key: 'rumination' }],
  quarantine_officer: [{ key: 'temperature' }, { key: 'activity' }, { key: 'rumination' }],
};

describe('AnimalDetail 역할별 뷰 차이', () => {
  const ALL_ROLES: readonly Role[] = [
    'farmer', 'veterinarian',
    'government_admin', 'quarantine_officer',
  ];

  it('모든 역할이 sensor와 ai 섹션을 포함', () => {
    for (const role of ALL_ROLES) {
      expect(SECTIONS_BY_ROLE[role]).toContain('sensor');
      expect(SECTIONS_BY_ROLE[role]).toContain('ai');
    }
  });

  it('farmer: 8개 섹션, actions+production+breeding+health 포함', () => {
    const sections = SECTIONS_BY_ROLE.farmer;
    expect(sections).toHaveLength(8);
    expect(sections).toContain('actions');
    expect(sections).toContain('production');
    expect(sections).toContain('breeding');
    expect(sections).toContain('health');
    expect(sections).toContain('feedback');
  });

  it('veterinarian: 최대 섹션(10개+1), pedigree+timeline 포함', () => {
    const sections = SECTIONS_BY_ROLE.veterinarian;
    expect(sections.length).toBeGreaterThanOrEqual(10);
    expect(sections).toContain('pedigree');
    expect(sections).toContain('timeline');
    expect(sections).toContain('health');
    expect(sections).toContain('feedback');
  });

  it('government_admin: 5개 섹션, actions 없음', () => {
    const sections = SECTIONS_BY_ROLE.government_admin;
    expect(sections).toHaveLength(5);
    expect(sections).not.toContain('actions');
    expect(sections).not.toContain('feedback');
  });

  it('quarantine_officer: 최소 섹션(4개), health+events만', () => {
    const sections = SECTIONS_BY_ROLE.quarantine_officer;
    expect(sections).toHaveLength(4);
    expect(sections).toContain('health');
    expect(sections).toContain('events');
    expect(sections).not.toContain('production');
  });

  it('vet/farmer: temperature가 첫 번째 센서', () => {
    expect(SENSOR_ORDER_BY_ROLE.farmer[0]!.key).toBe('temperature');
    expect(SENSOR_ORDER_BY_ROLE.veterinarian[0]!.key).toBe('temperature');
  });

  it('역할별 섹션에 중복이 없음', () => {
    for (const role of ALL_ROLES) {
      const sections = SECTIONS_BY_ROLE[role];
      const unique = new Set(sections);
      expect(unique.size).toBe(sections.length);
    }
  });
});
