// 문장 분할 테스트 — 첫 문장이 완성되는 즉시 TTS 로 보내는 것이 체감 지연의 핵심이다.
// 잘못 자르면 말이 끊기고, 못 자르면 답변이 다 끝난 뒤에야 소리가 난다.

import { describe, it, expect } from 'vitest';
import { splitSentences, permittedFarmId } from '../orchestrator.js';
import { stripForSpeech } from '../style.js';

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

describe('stripForSpeech', () => {
  it('마크다운 기호를 걷어낸다 — 소리로 읽을 수 없다', () => {
    expect(stripForSpeech('**1877번** 체온 `39.8`')).toBe('1877번 체온 39.8');
  });

  it('단위를 말로 바꾼다', () => {
    expect(stripForSpeech('체온 39.8°C, 반추 20% 감소')).toBe('체온 39.8도, 반추 20퍼센트 감소');
  });

  it('글머리표를 없앤다 — "하이픈"이라고 읽히면 안 된다', () => {
    expect(stripForSpeech('- 발정 2마리\n- 분만 임박 1마리')).toBe('발정 2마리 분만 임박 1마리');
  });

  it('링크는 라벨만 남긴다', () => {
    expect(stripForSpeech('[개체 상세](https://x.com/a)')).toBe('개체 상세');
  });
});

describe('permittedFarmId — 로스터 권한 경계', () => {
  it('권한 목록이 없으면(마스터·미배정 관리역할) 그대로 통과', () => {
    expect(permittedFarmId('f1', null)).toBe('f1');
    expect(permittedFarmId('f1', undefined)).toBe('f1');
  });

  it('권한 안의 농장이면 통과', () => {
    expect(permittedFarmId('f1', ['f1', 'f2'])).toBe('f1');
  });

  it('권한 밖 농장이면 null — 남의 목장 이표번호를 읽어주면 안 된다', () => {
    expect(permittedFarmId('f9', ['f1', 'f2'])).toBeNull();
  });

  it('빈 권한 목록이면 아무것도 통과하지 않는다', () => {
    expect(permittedFarmId('f1', [])).toBeNull();
  });

  it('farmId 가 없으면 null', () => {
    expect(permittedFarmId(null, null)).toBeNull();
    expect(permittedFarmId(undefined, ['f1'])).toBeNull();
  });
});
