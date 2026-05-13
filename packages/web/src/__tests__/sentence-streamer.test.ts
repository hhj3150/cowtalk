// extractCompleteSentences — 스트리밍 텍스트 → 완성 문장 분리 회귀 테스트.
//
// 검증:
// 1) 한국어 종결 어미(-다./-요./-까?) 인식
// 2) 일반 부호(. ! ? 。 …) 인식
// 3) 미완성 꼬리는 remainder로 보존
// 4) minLength 미만 토막은 다음 문장과 병합
// 5) 줄바꿈은 단독으론 종결 아님 (부호 + 공백 패턴)
// 6) 빈 입력 처리

import { describe, it, expect } from 'vitest';
import { extractCompleteSentences } from '@web/utils/sentence-streamer';

describe('extractCompleteSentences', () => {
  it('빈 입력 → 빈 결과', () => {
    expect(extractCompleteSentences('')).toEqual({ sentences: [], remainder: '' });
  });

  it('완전한 한국어 문장 1개', () => {
    const r = extractCompleteSentences('이 소는 발정 상태입니다. ');
    expect(r.sentences).toHaveLength(1);
    expect(r.sentences[0]).toBe('이 소는 발정 상태입니다.');
    expect(r.remainder).toBe('');
  });

  it('연속된 한국어 문장 — 각각 분리 (긴 문장)', () => {
    const r = extractCompleteSentences(
      '체온이 39도 8분으로 측정되었습니다. 케토시스 가능성이 의심되는 상황입니다. 수의사 호출을 즉시 권장합니다. ',
    );
    expect(r.sentences).toHaveLength(3);
    expect(r.sentences[0]).toContain('체온');
    expect(r.sentences[2]).toContain('수의사');
  });

  it('미완성 꼬리는 remainder로 보존', () => {
    const r = extractCompleteSentences('첫 번째 완성된 문장입니다. 두 번째 문장이 아직');
    expect(r.sentences).toHaveLength(1);
    expect(r.remainder).toBe('두 번째 문장이 아직');
  });

  it('너무 짧은 토막은 다음 문장과 병합', () => {
    // "네." (2자) + 긴 문장 → 합쳐서 1개로
    const r = extractCompleteSentences('네. 발정 시작 시점은 어제 오후 6시 무렵으로 추정됩니다. ');
    expect(r.sentences).toHaveLength(1);
    expect(r.sentences[0]).toContain('네.');
    expect(r.sentences[0]).toContain('어제 오후');
  });

  it('영어 문장 — 부호 + 공백 인식', () => {
    const r = extractCompleteSentences('Heat detected at 6 PM. Insemination window is tomorrow at 10 AM. ');
    expect(r.sentences).toHaveLength(2);
    expect(r.sentences[0]).toContain('Heat detected');
  });

  it('질문 부호 ?', () => {
    const r = extractCompleteSentences('이 소 언제 수정하면 좋아요? 정확한 시점을 알려드리겠습니다. ');
    expect(r.sentences.length).toBeGreaterThanOrEqual(1);
    expect(r.sentences[0]).toContain('?');
  });

  it('느낌표 !', () => {
    const r = extractCompleteSentences('이것은 매우 긴급한 케이스입니다! 즉시 현장 확인이 필요합니다. ');
    expect(r.sentences).toHaveLength(2);
  });

  it('부호 뒤 공백 없으면 종결로 인식 안 됨 (오인식 방지)', () => {
    // "3.8도" 같은 소수점 → 종결 X
    const r = extractCompleteSentences('체온 38.5도가 측정되었습니다. ');
    // 38.5도의 . 는 공백 미동반 → 종결 아님. 마지막 '습니다.' + ' '가 종결.
    expect(r.sentences).toHaveLength(1);
    expect(r.sentences[0]).toContain('38.5');
  });

  it('짧은 한국어 문장 (minLength 미달) — 단독으로 안 나옴', () => {
    const r = extractCompleteSentences('알겠습니다. ');
    // "알겠습니다." = 6자 < 12자 minLength → remainder로
    expect(r.sentences).toHaveLength(0);
    expect(r.remainder).toContain('알겠습니다');
  });

  it('짧은 minLength 지정 시 단독 문장 가능', () => {
    const r = extractCompleteSentences('네 알겠습니다. ', 5);
    expect(r.sentences).toHaveLength(1);
  });

  it('스트리밍 누적 시나리오 — 호출자가 remainder 합쳐 재호출', () => {
    let buffer = '';

    // chunk 1
    buffer += '발정 상태가 확인되었습니다';
    let r = extractCompleteSentences(buffer);
    expect(r.sentences).toHaveLength(0);
    buffer = r.remainder;

    // chunk 2
    buffer += '. 수정 적기는 내일 새벽 6시입니다.';
    r = extractCompleteSentences(buffer);
    expect(r.sentences).toHaveLength(2);
    expect(r.sentences[0]).toContain('발정 상태가 확인되었습니다.');
    expect(r.sentences[1]).toContain('수정 적기는 내일 새벽 6시입니다.');
    buffer = r.remainder;
    expect(buffer).toBe('');
  });
});
