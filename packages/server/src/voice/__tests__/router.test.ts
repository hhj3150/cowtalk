// 라우팅·선행응답 판정 테스트.
// 이 판정이 틀리면 단순 조회가 비싼 모델로 가거나(느림·비쌈),
// 진단 질문이 빠른 모델로 가서 답이 얕아진다. 규칙을 테스트로 고정한다.

import { describe, it, expect } from 'vitest';
import { routeUtterance, buildAck, shouldAck, extractAnimalNumber } from '../router.js';

describe('routeUtterance', () => {
  it('단순 조회는 빠른 모델로 보낸다', () => {
    for (const t of ['1877번 체온', '오늘 할 일 뭐야', '발정 몇 마리야', '덥나', '반추 어때']) {
      expect(routeUtterance(t).route, t).toBe('fast');
    }
  });

  it('진단·판단 질문은 주력 모델로 올린다', () => {
    for (const t of ['1877번 왜 열이 나지', '무슨 병 같아', '어떻게 해야 해', '정액 추천해줘']) {
      expect(routeUtterance(t).route, t).toBe('main');
    }
  });

  it('기록 의도는 반드시 주력 모델 — 되읽기 문장을 정확히 만들어야 한다', () => {
    for (const t of ['1877번 유방염 기록해', '수정했어 등록해줘', '처방 남겨']) {
      expect(routeUtterance(t).route, t).toBe('main');
    }
  });

  it('애매하면 주력으로 올린다 (오판 대가가 비대칭)', () => {
    expect(routeUtterance('그거 있잖아 어제 그 소').route).toBe('main');
  });

  it('조회 신호가 있어도 문장이 길면 주력으로 올린다', () => {
    const long = '1877번 체온이랑 반추 보고 어제랑 비교해서 상태가 어떤지 정리해줘 그리고 옆칸 소도';
    expect(routeUtterance(long).route).toBe('main');
  });
});

describe('extractAnimalNumber', () => {
  it('3~5자리 번호를 뽑는다', () => {
    expect(extractAnimalNumber('1877번 어때')).toBe('1877');
    expect(extractAnimalNumber('423 체온')).toBe('423');
  });
  it('번호가 없으면 null', () => {
    expect(extractAnimalNumber('오늘 할 일 뭐야')).toBeNull();
  });
  it('두 자리는 개체번호로 보지 않는다', () => {
    expect(extractAnimalNumber('12번')).toBeNull();
  });
});

describe('선행 응답', () => {
  it('번호가 있으면 번호를 붙여 형태를 고정한다 (TTS 캐시 적중용)', () => {
    expect(buildAck('1877번 체온')).toBe('1877번 확인하겠습니다.');
    expect(buildAck('오늘 할 일')).toBe('확인하겠습니다.');
  });

  it('인사·짧은 응답에는 붙이지 않는다', () => {
    for (const t of ['안녕', '응', '네', '고마워']) {
      expect(shouldAck(t), t).toBe(false);
    }
  });

  it('조회·기록 의도에는 붙인다', () => {
    for (const t of ['1877번 체온', '발정 몇 마리야', '기록해줘']) {
      expect(shouldAck(t), t).toBe(true);
    }
  });
});
