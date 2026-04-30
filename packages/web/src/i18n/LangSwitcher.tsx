// 작은 언어 선택자 — 데모에서 외국 방문객을 위해 한 번 클릭으로 언어 전환.
// 사용처: TinkerbellAssistant 헤더, 또는 글로벌 헤더.

import React from 'react';
import { useLang } from './useT';
import { LANG_LABELS, SUPPORTED_LANGS, type Lang } from './dict';

interface Props {
  readonly compact?: boolean;
}

export function LangSwitcher({ compact = false }: Props): React.JSX.Element {
  const { lang, setLang } = useLang();

  return (
    <select
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      aria-label="Language / 언어"
      title="Language / 언어 / Til / Язык / Хэл"
      style={{
        background: 'rgba(255,255,255,0.06)',
        color: 'var(--ct-text)',
        border: '1px solid var(--ct-border)',
        borderRadius: 6,
        padding: compact ? '2px 6px' : '4px 10px',
        fontSize: compact ? 11 : 12,
        cursor: 'pointer',
        outline: 'none',
      }}
    >
      {SUPPORTED_LANGS.map((l) => (
        <option key={l} value={l} style={{ background: '#1a1a1a', color: '#fff' }}>
          {LANG_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
