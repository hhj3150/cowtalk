// 문장 분할 테스트 — 첫 문장이 완성되는 즉시 TTS 로 보내는 것이 체감 지연의 핵심이다.
// 잘못 자르면 말이 끊기고, 못 자르면 답변이 다 끝난 뒤에야 소리가 난다.

import { describe, it, expect } from 'vitest';
import { splitSentences } from '../orchestrator.js';
import { trimForVoice } from '../tools.js';

describe('splitSentences', () => {
  it('한국어 종결어미에서 자른다', () => {
    const [s, rest] = splitSentences('1877번 체온 39.8도입니다. 유방염이 의심됩니다. 진료');
    expect(s).toEqual(['1877번 체온 39.8도입니다.', '유방염이 의심됩니다.']);
    expect(rest).toBe('진료');
  });

  it('완성 문장이 없으면 전부 남긴다 — 조각을 말하면 안 된다', () => {
    const [s, rest] = splitSentences('1877번 체온이');
    expect(s).toEqual([]);
    expect(rest).toBe('1877번 체온이');
  });

  it('물음표·마침표도 경계로 본다', () => {
    const [s] = splitSentences('1877번 맞습니까? 확인하겠습니다. ');
    expect(s).toHaveLength(2);
  });

  it('소수점은 문장 경계가 아니다', () => {
    const [, rest] = splitSentences('체온 39.8');
    expect(rest).toBe('체온 39.8');
  });
});

describe('trimForVoice', () => {
  it('짧으면 그대로 둔다', () => {
    expect(trimForVoice('체온 39.8도입니다.')).toBe('체온 39.8도입니다.');
  });

  it('길면 문장 경계에서 자른다', () => {
    const long = '가'.repeat(200) + '입니다. ' + '나'.repeat(200);
    const out = trimForVoice(long, 260);
    expect(out.length).toBeLessThanOrEqual(260);
    expect(out.endsWith('입니다.')).toBe(true);
  });

  it('공백을 정리한다 — 도구 결과에 줄바꿈이 섞여 온다', () => {
    expect(trimForVoice('체온  39.8도\n\n반추 정상')).toBe('체온 39.8도 반추 정상');
  });
});
