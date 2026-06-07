// KAHIS 약물보고 — validateDrugReport 순수 함수 단위 테스트 (8단계)
// 핵심: 처방대상 약물은 휴약·용량까지 필수(오남용 방지). DB 불필요.

import { describe, it, expect } from 'vitest';
import { validateDrugReport } from '../drug-report.service.js';

describe('validateDrugReport — 약물보고 필수검증', () => {
  it('처방대상 약물: 약품명/용량/투약일/휴약 모두 있어야 통과', () => {
    const r = validateDrugReport({
      isPrescriptionTarget: true,
      drugName: '옥시테트라사이클린', dosage: '10ml', administeredAt: '2026-06-01', withdrawalNote: '도축 28일',
    });
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('처방대상 약물: 휴약 누락 시 미통과 + 휴약기간 표기', () => {
    const r = validateDrugReport({
      isPrescriptionTarget: true,
      drugName: '항생제', dosage: '5ml', administeredAt: '2026-06-01', withdrawalNote: '',
    });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('휴약기간');
  });

  it('처방대상 약물: 여러 필드 누락 모두 보고', () => {
    const r = validateDrugReport({ isPrescriptionTarget: true, drugName: '항생제' });
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(expect.arrayContaining(['용법·용량', '투약일', '휴약기간']));
  });

  it('비대상 약물: 약품명+투약일만 있으면 통과(휴약 불요)', () => {
    const r = validateDrugReport({
      isPrescriptionTarget: false, drugName: '비타민', administeredAt: '2026-06-01',
    });
    expect(r.ok).toBe(true);
  });

  it('비대상 약물: 약품명 누락 시 미통과', () => {
    const r = validateDrugReport({ isPrescriptionTarget: false, administeredAt: '2026-06-01' });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('약품명');
  });

  it('공백 문자열은 미입력으로 간주', () => {
    const r = validateDrugReport({ isPrescriptionTarget: false, drugName: '   ', administeredAt: '2026-06-01' });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('약품명');
  });
});
