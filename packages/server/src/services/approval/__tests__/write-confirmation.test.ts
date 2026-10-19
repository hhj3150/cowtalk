import { describe, it, expect } from 'vitest';
import {
  classifyConfirmationUtterance,
  requiresWriteConfirmation,
  buildProposalSummary,
  stripConfirmationMeta,
} from '../write-confirmation.js';

describe('classifyConfirmationUtterance — 사용자 발화가 저장 승인인가', () => {
  it.each([
    '확인했어. 저장해',
    '저장해',
    '네',
    '네, 그렇게 해',
    '응 기록해',
    '맞아 확정해',
    '좋아',
    '확인 완료',
    'ok',
  ])('승인: %s', (t) => {
    expect(classifyConfirmationUtterance(t)).toBe('affirm');
  });

  it.each([
    '아니 저장하지 마',
    '잠깐, 그 소 말고 125번',
    '취소해',
    '저장하지 마',
    '나중에 할게',
    '용량이 틀렸어',
    '다시 작성해',
  ])('거부(승인 표현이 섞여도 거부가 이긴다): %s', (t) => {
    expect(classifyConfirmationUtterance(t)).toBe('deny');
  });

  it.each([
    '123번 상태 확인해줘',   // 조회 요청 — 승인 아님
    '그 소 마지막 수정일은?',
    '음',
    '',
  ])('애매하면 저장하지 않는다: %s', (t) => {
    expect(classifyConfirmationUtterance(t)).toBe('unclear');
  });

  it('"네"는 단어로만 — "네이버"·"네 마리"의 일부로 오인하지 않는다', () => {
    expect(classifyConfirmationUtterance('네이버에서 봤어')).toBe('unclear');
  });
});

describe('requiresWriteConfirmation', () => {
  it('진료·수정·임신감정·치료결과·레이블·처방은 확인 대상', () => {
    for (const t of ['record_treatment', 'record_insemination', 'record_pregnancy_check', 'confirm_treatment_outcome', 'record_expert_label', 'schedule_sync_protocol']) {
      expect(requiresWriteConfirmation(t)).toBe(true);
    }
  });
  it('조회 도구·유량 입력은 대상이 아니다', () => {
    expect(requiresWriteConfirmation('query_animal')).toBe(false);
    expect(requiresWriteConfirmation('record_milk_yield')).toBe(false);
  });
});

describe('buildProposalSummary', () => {
  it('개체 표시와 사람이 읽는 필드만 담는다 (내부 id 미노출)', () => {
    const s = buildProposalSummary(
      'record_treatment',
      { animalId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', diagnosis: '자궁염', drug: '세프티오퍼', dosage: '20ml', route: 'IM', withdrawalDays: 3 },
      { animalLabel: '송영신목장 123번' },
    );
    expect(s).toContain('[진료(치료) 기록]');
    expect(s).toContain('개체: 송영신목장 123번');
    expect(s).toContain('진단: 자궁염');
    expect(s).toContain('용량: 20ml');
    expect(s).toContain('휴약기간(일): 3');
    expect(s).not.toContain('aaaaaaaa');
  });
});

describe('stripConfirmationMeta', () => {
  it('confirmationId만 빼고 나머지는 그대로', () => {
    expect(stripConfirmationMeta({ confirmationId: 'x', animalId: 'a', diagnosis: 'd' })).toEqual({ animalId: 'a', diagnosis: 'd' });
  });
});
