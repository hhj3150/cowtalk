// 진료기록 수정 이력 — diffEditableFields 순수 함수 단위 테스트 (3단계)
// 원칙: 변경된 수의사 입력 필드만 골라 '수정 전 값'을 보존. DB·Claude 불필요.

import { describe, it, expect } from 'vitest';
import { diffEditableFields, EDITABLE_VISIT_FIELDS } from '../visit.service.js';

describe('diffEditableFields — 진료기록 수정 diff', () => {
  it('변경 없으면 hasChanges=false (제공된 필드가 기존과 동일)', () => {
    const existing = { finalDiagnosis: '케토시스', treatment: '포도당' };
    const d = diffEditableFields(existing, { finalDiagnosis: '케토시스' });
    expect(d.hasChanges).toBe(false);
    expect(d.changedFields).toEqual([]);
    expect(d.previousValues).toEqual({});
  });

  it('변경된 필드만 changedFields에 담고 수정 전 값을 보존한다', () => {
    const existing = { finalDiagnosis: '케토시스', treatment: '포도당', prescription: null };
    const d = diffEditableFields(existing, {
      finalDiagnosis: '산후 자궁염', // 변경
      treatment: '포도당',          // 동일 → 제외
      prescription: '항생제',        // null → 값 (변경)
    });
    expect(d.hasChanges).toBe(true);
    expect(d.changedFields.sort()).toEqual(['finalDiagnosis', 'prescription']);
    expect(d.previousValues).toEqual({ finalDiagnosis: '케토시스', prescription: null });
  });

  it('패치에 없는 필드는 검토하지 않는다 (부분 수정 안전)', () => {
    const existing = { finalDiagnosis: '케토시스', treatment: '포도당' };
    const d = diffEditableFields(existing, { treatment: '수액' });
    expect(d.changedFields).toEqual(['treatment']);
    expect('finalDiagnosis' in d.previousValues).toBe(false);
  });

  it('boolean(quarantineRequired)을 안전 비교한다', () => {
    const existing = { quarantineRequired: false };
    expect(diffEditableFields(existing, { quarantineRequired: false }).hasChanges).toBe(false);
    const d = diffEditableFields(existing, { quarantineRequired: true });
    expect(d.changedFields).toEqual(['quarantineRequired']);
    expect(d.previousValues).toEqual({ quarantineRequired: false });
  });

  it('편집 불가 필드(visitId/snapshot 등)는 무시한다', () => {
    const existing = { visitId: 'a', finalDiagnosis: 'x' };
    const d = diffEditableFields(existing, {
      visitId: 'TAMPERED', finalDiagnosis: 'x',
    } as Record<string, unknown>);
    expect(d.hasChanges).toBe(false);
    expect(d.changedFields).not.toContain('visitId');
  });

  it('EDITABLE_VISIT_FIELDS에 핵심 진료 필드가 포함된다', () => {
    expect(EDITABLE_VISIT_FIELDS).toContain('finalDiagnosis');
    expect(EDITABLE_VISIT_FIELDS).toContain('prescription');
    expect(EDITABLE_VISIT_FIELDS).toContain('withdrawalPeriod');
    expect(EDITABLE_VISIT_FIELDS).not.toContain('visitId');
  });
});
