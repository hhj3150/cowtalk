import { describe, it, expect } from 'vitest';
import {
  classifyConfirmationUtterance,
  requiresWriteConfirmation,
  buildProposalSummary,
  stripConfirmationMeta,
  extractUserUtterance,
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

// VO-02 회귀 — 감사에서 전부 '승인'으로 판정됐던 문장들
describe('VO-02 부정문·부분 일치를 승인으로 오판하지 않는다', () => {
  it.each([
    ['저장 안 할래', 'deny'],
    ['저장하지 않을게', 'deny'],
    ['아직 확정 안 됐어', 'deny'],
    ['용량 20ml로 바꿔줘', 'deny'],
    ['못 하겠어', 'deny'],
    ['좋아지고 있어', 'unclear'],
    ['그래서 체온은?', 'unclear'],
    ['네 번째 소', 'unclear'],
    ['저장해 그리고 다음 소도 봐줘', 'unclear'],
    ['기록할까요', 'unclear'],
  ] as const)('%s → %s', (t, expected) => {
    expect(classifyConfirmationUtterance(t)).toBe(expected);
  });

  it.each(['네 저장해주세요', '예, 진행해 주세요', '확인했습니다', '좋아요 그렇게 해줘', 'yes please'])('정상 승인은 유지: %s', (t) => {
    expect(classifyConfirmationUtterance(t)).toBe('affirm');
  });
});

describe('VO-01 extractUserUtterance — 맥락이 아닌 사용자 원문만', () => {
  const wrapped = '[팅커벨 AI — 개체 전담 모드]\n3일이내: 예\n최근 치료: 있음\n\n사용자 질문: 용량 20ml로 바꿔줘';

  it('userText 가 있으면 그대로', () => {
    expect(extractUserUtterance(wrapped, '네 저장해')).toBe('네 저장해');
  });
  it('구버전 클라이언트 — 마지막 "사용자 질문:" 뒤만', () => {
    expect(extractUserUtterance(wrapped)).toBe('용량 20ml로 바꿔줘');
  });
  it('"질문:" 표지도 인식', () => {
    expect(extractUserUtterance('[대화 모드] 지시문\n\n질문: 저장해')).toBe('저장해');
  });
  it('표지가 없으면 그대로', () => {
    expect(extractUserUtterance('저장해')).toBe('저장해');
  });
  it('맥락 속 "예" 때문에 승인되던 사례가 이제 거부로 판정된다', () => {
    expect(classifyConfirmationUtterance(wrapped)).not.toBe('affirm');
    expect(classifyConfirmationUtterance(extractUserUtterance(wrapped))).toBe('deny');
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

describe('VO-08 확인 요약에 저장되는 값이 전부 보인다', () => {
  it('유방 분방·CMT·BCS·탈수도·정액 카탈로그가 빠지지 않는다', () => {
    const s = buildProposalSummary(
      'record_treatment',
      { animalId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', diagnosis: '유방염', affectedQuarter: 'LF', cmtResult: '++', bcs: 3.25, hydrationLevel: 'moderate' },
      { animalLabel: '송영신목장 123번' },
    );
    expect(s).toContain('이환 분방: 좌전 (LF)');
    expect(s).toContain('CMT 결과: ++');
    expect(s).toContain('체형점수(BCS): 3.25');
    expect(s).toContain('탈수 정도: 중등도 (moderate)');
    expect(s).not.toContain('aaaaaaaa');
  });
  it('정액 카탈로그 지정은 재고 차감을 함께 알린다', () => {
    const s = buildProposalSummary('record_insemination', { animalId: 'a', farmId: 'f', semenId: 's-1', semenInfo: 'KPN1234' }, {});
    expect(s).toContain('정액: KPN1234');
    expect(s).toContain('정액 카탈로그(재고 1개 차감): s-1');
  });
  it('모르는 키도 저장된다면 빠뜨리지 않는다', () => {
    expect(buildProposalSummary('record_treatment', { animalId: 'a', newField: 'x' }, {})).toContain('newField: x');
  });
});

describe('VO-08 extractPendingConfirmation', () => {
  it('저장 대기 제안만 꺼낸다', async () => {
    const { extractPendingConfirmation } = await import('../write-confirmation.js');
    expect(extractPendingConfirmation(JSON.stringify({ confirmationRequired: true, confirmationId: 'c1', summary: '요약' })))
      .toEqual({ confirmationId: 'c1', summary: '요약' });
    expect(extractPendingConfirmation(JSON.stringify({ success: true }))).toBeNull();
    expect(extractPendingConfirmation('not json')).toBeNull();
  });
});
