// 경량 i18n 훅 — 외부 의존성 없이 React Context + Hook + localStorage 영속화.
// 사용자가 언어 명시 변경 시 localStorage 'cowtalk_lang'에 저장. 미설정 시 navigator.language.
//
// 사용:
//   const t = useT();
//   t('tb.sugg.quarantine.fever_status')                  // 단순 lookup
//   t('tb.sugg.dyn.critical_count', { count: 3 })         // {count} 등 placeholder

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { DICT, type Lang, SUPPORTED_LANGS } from './dict';

const LANG_STORAGE_KEY = 'cowtalk_lang';

export function detectLang(): Lang {
  if (typeof window === 'undefined') return 'ko';

  // 1순위: localStorage 사용자 명시 선택
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved && (SUPPORTED_LANGS as readonly string[]).includes(saved)) {
      return saved as Lang;
    }
  } catch {
    // localStorage 접근 실패 (private mode 등) — navigator.language로 fallback
  }

  // 2순위: navigator.language
  const raw = (navigator.language || 'ko').toLowerCase();
  if (raw.startsWith('ko')) return 'ko';
  if (raw.startsWith('en')) return 'en';
  if (raw.startsWith('uz')) return 'uz';
  if (raw.startsWith('ru')) return 'ru';
  if (raw.startsWith('mn')) return 'mn';
  return 'ko';
}

interface LangContextValue {
  readonly lang: Lang;
  readonly setLang: (lang: Lang) => void;
}

const LangContext = createContext<LangContextValue>({
  lang: 'ko',
  setLang: () => {},
});

export function LangProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const [lang, setLangState] = useState<Lang>(() => detectLang());

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // localStorage 실패 무시 (다음 진입 시 navigator.language로)
    }
  }, []);

  // 다른 탭에서 언어 변경 시 동기화
  useEffect(() => {
    function handleStorage(e: StorageEvent): void {
      if (e.key === LANG_STORAGE_KEY && e.newValue && (SUPPORTED_LANGS as readonly string[]).includes(e.newValue)) {
        setLangState(e.newValue as Lang);
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);

  return React.createElement(LangContext.Provider, { value }, children);
}

export type TFunction = (key: string, params?: Record<string, string | number>) => string;

export function useT(): TFunction {
  const { lang } = useContext(LangContext);

  return useCallback((key: string, params?: Record<string, string | number>): string => {
    // 우선순위: 현재 언어 → 한국어(원본) → key 자체
    const raw = DICT[lang]?.[key] ?? DICT.ko[key] ?? key;
    if (!params) return raw;
    return raw.replace(/\{(\w+)\}/g, (match, name) => {
      const v = params[name];
      return v !== undefined ? String(v) : match;
    });
  }, [lang]);
}

export function useLang(): { readonly lang: Lang; readonly setLang: (lang: Lang) => void } {
  return useContext(LangContext);
}

// ── 의존성 없이 사용할 수 있는 순수 함수 (React 컨텍스트 밖에서 호출 시) ──
export function pureT(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const raw = DICT[lang]?.[key] ?? DICT.ko[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name) => {
    const v = params[name];
    return v !== undefined ? String(v) : match;
  });
}
