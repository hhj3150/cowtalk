import { describe, it, expect } from 'vitest';
import {
  correctSttTranscript,
  normalizeKoreanNumerals,
  correctLivestockTerms,
} from '../stt-correction';

describe('normalizeKoreanNumerals', () => {
  it('개체번호를 아라비아 숫자로 바꾼다', () => {
    expect(normalizeKoreanNumerals('사백이십삼번 소 상태 알려줘')).toBe('423번 소 상태 알려줘');
    expect(normalizeKoreanNumerals('삼번 개체')).toBe('3번 개체');
    expect(normalizeKoreanNumerals('이십번')).toBe('20번');
    expect(normalizeKoreanNumerals('천오백번')).toBe('1500번');
  });

  it('자릿수 문자 없이 나열한 숫자는 번호 나열로 읽는다', () => {
    // "공사삼이번" — 이력제/귀표 번호를 한 자리씩 부르는 방식
    expect(normalizeKoreanNumerals('공사삼이번')).toBe('0432번');
  });

  it('고유어 수사 + 단위도 처리한다', () => {
    expect(normalizeKoreanNumerals('두 마리 더 있어')).toBe('2마리 더 있어');
    expect(normalizeKoreanNumerals('세 번째 수정')).toBe('3번째 수정');
  });

  it('축산 단위를 인식한다', () => {
    expect(normalizeKoreanNumerals('삼산차 소')).toBe('3산차 소');
    expect(normalizeKoreanNumerals('공태 이백일')).toBe('공태 200일');
  });

  it('단위가 없는 수사는 건드리지 않는다 — 오교정 방지', () => {
    // "이" 는 지시어, "사" 는 동사 어간 등으로 쓰인다
    expect(normalizeKoreanNumerals('이 소는 상태가 좋아')).toBe('이 소는 상태가 좋아');
    expect(normalizeKoreanNumerals('사료 좀 봐줘')).toBe('사료 좀 봐줘');
  });

  it('이미 아라비아 숫자인 입력은 그대로 둔다', () => {
    expect(normalizeKoreanNumerals('423번 소')).toBe('423번 소');
  });
});

describe('correctLivestockTerms', () => {
  it('발정 오인식을 맥락이 확인될 때만 고친다', () => {
    expect(correctLivestockTerms('발전 왔어')).toBe('발정 왔어');
    expect(correctLivestockTerms('발전 징후 있나')).toBe('발정 징후 있나');
    // 축산 맥락이 없으면 건드리지 않는다
    expect(correctLivestockTerms('발전소가 어디야')).toBe('발전소가 어디야');
  });

  it('질병명 오인식을 교정한다', () => {
    expect(correctLivestockTerms('게토시스 의심돼')).toBe('케토시스 의심돼');
    expect(correctLivestockTerms('케토 시스 위험')).toBe('케토시스 위험');
    expect(correctLivestockTerms('우방염 걸렸어')).toBe('유방염 걸렸어');
    expect(correctLivestockTerms('자궁 내 막염')).toBe('자궁내막염');
  });

  it('띄어쓰기가 흩어진 복합어를 붙인다', () => {
    expect(correctLivestockTerms('임신 감정 언제 해')).toBe('임신감정 언제 해');
    expect(correctLivestockTerms('인공 수정 기록')).toBe('인공수정 기록');
    expect(correctLivestockTerms('체 세포 수 높아')).toBe('체세포수 높아');
  });

  it('호명 오인식을 정규화한다', () => {
    expect(correctLivestockTerms('딩커벨 도와줘')).toBe('팅커벨 도와줘');
  });

  it('일상어와 겹치는 단어는 손대지 않는다', () => {
    // "수정"은 문서 수정 등으로도 쓰이므로 단독 교정 대상이 아니다
    expect(correctLivestockTerms('수정 좀 해줘')).toBe('수정 좀 해줘');
  });
});

describe('correctSttTranscript', () => {
  it('숫자 변환과 용어 교정을 함께 적용한다', () => {
    const r = correctSttTranscript('사백이십삼번 소 발전 왔어');
    expect(r.text).toBe('423번 소 발정 왔어');
    expect(r.changed).toBe(true);
  });

  it('바뀐 게 없으면 changed가 false', () => {
    const r = correctSttTranscript('오늘 유량 어때');
    expect(r.text).toBe('오늘 유량 어때');
    expect(r.changed).toBe(false);
  });

  it('한국어가 아니면 통과시킨다', () => {
    const r = correctSttTranscript('show me cow 423 status', 'en');
    expect(r.text).toBe('show me cow 423 status');
    expect(r.changed).toBe(false);
  });

  it('빈 입력에 안전하다', () => {
    expect(correctSttTranscript('').text).toBe('');
    expect(correctSttTranscript('   ').text).toBe('');
  });
});
