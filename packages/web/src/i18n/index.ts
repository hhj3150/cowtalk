// i18n 골격 — 수출 대비 (개발 원칙 #5: 한국 특화이되 글로벌 확장 가능 구조)
//
// 외부 의존성 없는 경량 사전 방식. ko가 기준(default)이며 en부터 시작,
// 팅커벨 uiLang(ko/en/uz/ru/mn)과 언어 코드를 공유해 향후 확장한다.
// 전환 패턴: 하드코딩 한국어 → 사전 키 등록 → useT()로 치환 (화면 단위 점진 전환).
// 사전에 없는 키는 ko 값 → 키 원문 순으로 폴백 — 미번역이 화면을 깨지 않는다.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ko } from './locales/ko';
import { en } from './locales/en';

export type UiLanguage = 'ko' | 'en';

export const LANGUAGE_LABELS: Readonly<Record<UiLanguage, string>> = {
  ko: '한국어',
  en: 'English',
};

const DICTIONARIES: Readonly<Record<UiLanguage, Readonly<Record<string, string>>>> = { ko, en };

interface LanguageState {
  readonly language: UiLanguage;
  readonly setLanguage: (lang: UiLanguage) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: 'ko',
      setLanguage: (language) => { set({ language }); },
    }),
    { name: 'cowtalk-language' },
  ),
);

/** 순수 번역 함수 — 테스트 대상. 미등록 키는 ko → 키 원문 폴백 */
export function translate(lang: UiLanguage, key: string): string {
  return DICTIONARIES[lang][key] ?? DICTIONARIES.ko[key] ?? key;
}

/** 컴포넌트용 훅 — const t = useT(); t('nav.dashboard') */
export function useT(): (key: string) => string {
  const language = useLanguageStore((s) => s.language);
  return (key: string) => translate(language, key);
}
