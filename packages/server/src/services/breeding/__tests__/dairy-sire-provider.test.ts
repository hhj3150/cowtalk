import { describe, it, expect } from 'vitest';
import {
  isDairyBreed,
  breedFamily,
  getDairyMatingReadiness,
  DAIRY_DATA_SOURCES,
  type DairyDataSource,
} from '../dairy-sire-provider.js';

describe('breedFamily — 표기 차이 견고성', () => {
  it("'Holstein'·'holstein'·'젖소'는 dairy로 같은 계열", () => {
    expect(breedFamily('Holstein')).toBe('dairy');
    expect(breedFamily('holstein')).toBe('dairy');
    expect(breedFamily('젖소')).toBe('dairy');
    expect(breedFamily('Holstein')).toBe(breedFamily('holstein'));
  });
  it("'한우'·'Hanwoo'는 beef", () => {
    expect(breedFamily('한우')).toBe('beef');
    expect(breedFamily('Hanwoo')).toBe('beef');
  });
  it('알 수 없으면 unknown', () => {
    expect(breedFamily(null)).toBe('unknown');
    expect(breedFamily('')).toBe('unknown');
    expect(breedFamily('Wagyu교잡')).toBe('unknown');
  });
});

describe('isDairyBreed', () => {
  it('젖소 계열을 인식한다', () => {
    for (const b of ['젖소', '홀스타인', 'Holstein', 'dairy', 'Jersey', '저지']) {
      expect(isDairyBreed(b)).toBe(true);
    }
  });

  it('한우/육우는 제외한다', () => {
    for (const b of ['한우', 'Hanwoo', '육우', 'beef', null, undefined, '']) {
      expect(isDairyBreed(b)).toBe(false);
    }
  });
});

describe('getDairyMatingReadiness — 현재 수준', () => {
  it('혈통·DHI가 pending이면 신뢰도 low / minimal 이고 내부·등급은 live', () => {
    const r = getDairyMatingReadiness();
    expect(r.confidence).toBe('low');
    expect(r.overall).toBe('minimal');
    expect(r.liveSources.map((s) => s.id)).toContain('cowtalk_internal');
    expect(r.pendingSources.map((s) => s.id)).toEqual(
      expect.arrayContaining(['dhi_test', 'kaia_pedigree']),
    );
    expect(r.summary).toContain('연동 시 정밀화');
  });
});

describe('getDairyMatingReadiness — 미래 연동 시', () => {
  it('혈통+DHI가 live가 되면 신뢰도 high / ready 로 자동 상승한다', () => {
    const future: DairyDataSource[] = DAIRY_DATA_SOURCES.map((s) =>
      s.id === 'dhi_test' || s.id === 'kaia_pedigree' ? { ...s, status: 'live' } : s,
    );
    const r = getDairyMatingReadiness(future);
    expect(r.confidence).toBe('high');
    expect(r.overall).toBe('ready');
    expect(r.pendingSources).toHaveLength(0);
  });

  it('혈통만 live면 medium / partial', () => {
    const partial: DairyDataSource[] = DAIRY_DATA_SOURCES.map((s) =>
      s.id === 'kaia_pedigree' ? { ...s, status: 'live' } : s,
    );
    const r = getDairyMatingReadiness(partial);
    expect(r.confidence).toBe('medium');
    expect(r.overall).toBe('partial');
  });
});
