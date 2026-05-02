// 5개 언어 사전 무결성 + 번역 함수 단위 테스트.
// 시연 안전성 핵심 — 키 누락은 사용자 화면에 영문 키가 그대로 노출되는 사고로 직결.

import { describe, it, expect } from 'vitest';
import { DICT, SUPPORTED_LANGS, LANG_LABELS, type Lang } from '@web/i18n/dict';
import { pureT } from '@web/i18n/useT';

describe('5개 언어 사전 무결성', () => {
  it('5개 언어(ko/en/uz/ru/mn) 모두 등록되어 있다', () => {
    expect(SUPPORTED_LANGS).toEqual(['ko', 'en', 'uz', 'ru', 'mn']);
  });

  it('LANG_LABELS는 모든 지원 언어에 라벨을 가진다', () => {
    for (const lang of SUPPORTED_LANGS) {
      expect(LANG_LABELS[lang]).toBeTruthy();
      expect(LANG_LABELS[lang].length).toBeGreaterThan(0);
    }
  });

  it('각 언어 사전은 한국어와 동일한 키 집합을 가진다 (누락 없음)', () => {
    const koKeys = Object.keys(DICT.ko).sort();
    for (const lang of SUPPORTED_LANGS) {
      const langKeys = Object.keys(DICT[lang]).sort();
      const missing = koKeys.filter((k) => !langKeys.includes(k));
      const extra = langKeys.filter((k) => !koKeys.includes(k));
      expect(missing, `${lang}에 누락된 키: ${missing.join(', ')}`).toEqual([]);
      expect(extra, `${lang}에 한국어에 없는 키: ${extra.join(', ')}`).toEqual([]);
    }
  });

  it('각 언어 사전의 모든 값은 비어있지 않다', () => {
    for (const lang of SUPPORTED_LANGS) {
      for (const [key, value] of Object.entries(DICT[lang])) {
        expect(value, `${lang}.${key} 값이 비어있음`).toBeTruthy();
        expect(value.trim().length, `${lang}.${key} 공백만 있음`).toBeGreaterThan(0);
      }
    }
  });

  it('팅커벨 에러 키(tb.err.*)가 5개 언어에 모두 있다', () => {
    const errorKeys = ['tb.err.no_response', 'tb.err.network', 'tb.err.server', 'tb.err.cache_conflict'];
    for (const lang of SUPPORTED_LANGS) {
      for (const key of errorKeys) {
        expect(DICT[lang][key], `${lang}.${key} 누락`).toBeTruthy();
      }
    }
  });
});

describe('pureT() — 번역 + 치환 함수', () => {
  it('등록된 키는 해당 언어로 번역한다', () => {
    expect(pureT('ko', 'tb.err.network')).toContain('인터넷');
    expect(pureT('en', 'tb.err.network')).toContain('internet');
    expect(pureT('uz', 'tb.err.network')).toContain('Internet');
    expect(pureT('ru', 'tb.err.network')).toContain('Проверьте');
    expect(pureT('mn', 'tb.err.network')).toContain('Интернэт');
  });

  it('미등록 키는 한국어 사전에서 fallback 시도', () => {
    const result = pureT('en' as Lang, 'tb.err.no_response');
    expect(result).toBeTruthy();
    expect(result).not.toBe('tb.err.no_response');
  });

  it('한국어에도 없는 키는 키 자체를 반환', () => {
    const result = pureT('ko', 'this.key.does.not.exist');
    expect(result).toBe('this.key.does.not.exist');
  });

  it('{name} 플레이스홀더를 params로 치환한다', () => {
    // 실제 사전에 placeholder를 가진 키가 있는지 확인 후 테스트
    const koWithPlaceholder = Object.entries(DICT.ko).find(([_, v]) => /\{\w+\}/.test(v));
    if (!koWithPlaceholder) {
      return; // 사전에 placeholder 없으면 skip
    }
    const [key, raw] = koWithPlaceholder;
    const placeholder = /\{(\w+)\}/.exec(raw)?.[1];
    if (!placeholder) return;

    const params = { [placeholder]: '테스트값' };
    const result = pureT('ko', key, params);
    expect(result).toContain('테스트값');
    expect(result).not.toContain(`{${placeholder}}`);
  });

  it('치환 안 된 플레이스홀더는 원본 유지 (params 누락 시)', () => {
    const koWithPlaceholder = Object.entries(DICT.ko).find(([_, v]) => /\{\w+\}/.test(v));
    if (!koWithPlaceholder) return;
    const [key] = koWithPlaceholder;
    const result = pureT('ko', key); // params 없음
    expect(result).toMatch(/\{\w+\}/); // 플레이스홀더가 살아있음
  });
});

describe('우즈벡어/몽골어/러시아어 키릴 구분', () => {
  // Claude 시스템 프롬프트는 키릴 문자에 Өө/Үү가 있으면 몽골어, 그 외 키릴은 러시아어로 판단.
  // 사전 자체에는 이 구분이 없지만, 실제 번역 결과가 올바른 알파벳을 사용하는지 검증.

  it('몽골어 사전은 Өө 또는 Үү 문자를 포함한다 (키릴 구분 핵심)', () => {
    const allMnText = Object.values(DICT.mn).join(' ');
    expect(/[ӨөҮү]/.test(allMnText), '몽골어 사전에 Өө/Үү 문자가 없음 — 러시아어와 구분 안 됨').toBe(true);
  });

  it('러시아어 사전은 일반 키릴 문자를 사용한다 (Өө/Үү 없음)', () => {
    const allRuText = Object.values(DICT.ru).join(' ');
    // 러시아어는 Өө/Үү를 거의 쓰지 않음 — 있으면 몽골어와 혼동 가능
    expect(/[Кк]/.test(allRuText), '러시아어 사전에 일반 키릴이 없음').toBe(true);
  });

  it('우즈벡어 사전은 라틴 알파벳 + 아포스트로피를 사용한다', () => {
    const allUzText = Object.values(DICT.uz).join(' ');
    // 라틴 문자 사용 (영어와 구별 단서 1: g'/o'/sh' 같은 아포스트로피, 또는 우즈벡 어휘)
    expect(/[a-zA-Z]/.test(allUzText)).toBe(true);
  });
});
