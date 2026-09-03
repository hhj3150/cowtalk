import { describe, it, expect } from 'vitest';
import {
  parseSinoKorean,
  parseDigitByDigit,
  extractNumberCandidates,
  extractSpokenAnimalNumbers,
  editDistance,
} from '../number-normalize.js';

describe('parseSinoKorean — 자릿수 낭독', () => {
  it('천팔백칠십칠 → 1877', () => {
    expect(parseSinoKorean('천팔백칠십칠')).toBe(1877);
  });

  it('사백이십삼 → 423', () => {
    expect(parseSinoKorean('사백이십삼')).toBe(423);
  });

  it('이천 → 2000', () => {
    expect(parseSinoKorean('이천')).toBe(2000);
  });

  it('숫자가 아닌 말은 null — 억지로 만들지 않는다', () => {
    expect(parseSinoKorean('발정')).toBeNull();
    expect(parseSinoKorean('')).toBeNull();
  });
});

describe('parseDigitByDigit — 낱자 낭독', () => {
  it('일팔칠칠 → 1877 (현장에서 가장 흔한 방식)', () => {
    expect(parseDigitByDigit('일팔칠칠')).toBe(1877);
  });

  it('사이삼 → 423', () => {
    expect(parseDigitByDigit('사이삼')).toBe(423);
  });

  it('공사이삼 → 423 (앞자리 0은 숫자로 접힌다)', () => {
    expect(parseDigitByDigit('공사이삼')).toBe(423);
  });

  it('두 글자는 개체번호로 보지 않는다', () => {
    expect(parseDigitByDigit('일팔')).toBeNull();
  });

  it('자릿수 한글이 섞이면 낱자 낭독이 아니다', () => {
    expect(parseDigitByDigit('천팔백')).toBeNull();
  });
});

describe('extractNumberCandidates', () => {
  it('아라비아 숫자를 뽑는다', () => {
    expect(extractNumberCandidates('1877번 체온 알려줘')).toContain('1877');
  });

  it('STT 가 쪼개 놓은 숫자를 붙인다 — "18 77" → 1877', () => {
    expect(extractNumberCandidates('18 77번 체온')).toContain('1877');
  });

  it('쉼표가 끼어도 붙인다', () => {
    expect(extractNumberCandidates('1,877번')).toContain('1877');
  });

  it('한글 낭독도 뽑는다', () => {
    expect(extractNumberCandidates('일팔칠칠번 상태')).toContain('1877');
  });

  it('여러 번호가 나오면 순서대로 다 뽑는다', () => {
    const out = extractNumberCandidates('1877 말고 1902번');
    expect(out).toEqual(['1877', '1902']);
  });

  it('두 자리 수치는 개체번호 후보가 아니다', () => {
    expect(extractNumberCandidates('체온 39도')).toEqual([]);
  });
});

describe('extractSpokenAnimalNumbers — 표지 요구', () => {
  it('"번"이 붙은 숫자만 개체번호로 본다', () => {
    expect(extractSpokenAnimalNumbers('1877번 체온')).toEqual(['1877']);
  });

  it('연도는 개체번호가 아니다 — 이걸 잡으면 엉뚱한 되묻기가 생긴다', () => {
    expect(extractSpokenAnimalNumbers('2026년 계획 알려줘')).toEqual([]);
  });

  it('표지 없는 숫자는 자동 대조 대상이 아니다', () => {
    expect(extractSpokenAnimalNumbers('1877 체온')).toEqual([]);
  });

  it('한글 낭독 + 번 도 잡는다', () => {
    expect(extractSpokenAnimalNumbers('일팔칠칠번 상태')).toContain('1877');
  });
});

describe('editDistance', () => {
  it('한 글자 차이', () => {
    expect(editDistance('1877', '1878')).toBe(1);
  });

  it('같으면 0', () => {
    expect(editDistance('423', '423')).toBe(0);
  });

  it('빈 문자열', () => {
    expect(editDistance('', '423')).toBe(3);
  });
});
