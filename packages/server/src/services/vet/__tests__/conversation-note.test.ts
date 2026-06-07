// 대화형 진료기록 — AI 출력 안전 강제변환(coerceNote) 단위 테스트
// 원칙: AI/외부 출력이 누락·오타입이어도 크래시 없이 안전한 StructuredNote로 정규화.
// DB·Claude 불필요 — 순수 함수 검증.

import { describe, it, expect } from 'vitest';
import { coerceNote, CONVERSATION_NOTE_DISCLAIMER } from '../conversation-note.service.js';

describe('coerceNote — AI 출력 안전 강제변환', () => {
  it('null/undefined 입력도 빈 StructuredNote로 정규화한다', () => {
    const n = coerceNote(null);
    expect(n.final_diagnosis).toBe('');
    expect(n.quarantine_required).toBe(false);
    expect(n.document_suggestions).toEqual([]);
    expect(n.safety_warnings).toEqual([]);
  });

  it('정상 필드를 그대로 보존한다', () => {
    const n = coerceNote({
      final_diagnosis: '산후 자궁염',
      treatment: '항생제 투여',
      quarantine_required: true,
      document_suggestions: ['medical_record', 'prescription'],
      safety_warnings: ['휴약기간 확인 필요'],
    });
    expect(n.final_diagnosis).toBe('산후 자궁염');
    expect(n.treatment).toBe('항생제 투여');
    expect(n.quarantine_required).toBe(true);
    expect(n.document_suggestions).toEqual(['medical_record', 'prescription']);
    expect(n.safety_warnings).toEqual(['휴약기간 확인 필요']);
  });

  it('잘못된 타입(숫자/객체/문자열 배열필드)을 안전하게 정규화한다', () => {
    const n = coerceNote({
      final_diagnosis: 12345,            // 숫자 → 빈 문자열
      quarantine_required: 'yes',        // 문자열 → false (엄격 비교)
      document_suggestions: 'medical_record', // 배열 아님 → []
      missing_required_fields: [1, 2],   // 숫자 배열 → 문자열 배열
    });
    expect(n.final_diagnosis).toBe('');
    expect(n.quarantine_required).toBe(false);
    expect(n.document_suggestions).toEqual([]);
    expect(n.missing_required_fields).toEqual(['1', '2']);
  });

  it('disclaimer 문구가 최종 확인 책임을 명시한다', () => {
    expect(CONVERSATION_NOTE_DISCLAIMER).toContain('담당 수의사');
    expect(CONVERSATION_NOTE_DISCLAIMER).toContain('확인');
  });
});
