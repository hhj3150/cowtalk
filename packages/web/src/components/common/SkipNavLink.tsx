// 스킵 네비게이션 링크 — 키보드/스크린리더 사용자를 위한 메인 콘텐츠 바로가기

import React from 'react';

export function SkipNavLink(): React.JSX.Element {
  return (
    <a
      href="#main-content"
      className="skip-nav-link"
      style={{
        position: 'absolute',
        top: -100,
        left: 0,
        zIndex: 99999,
        padding: '8px 16px',
        background: 'var(--ct-primary)',
        color: '#fff',
        fontSize: 14,
        fontWeight: 700,
        textDecoration: 'none',
        borderRadius: '0 0 8px 0',
        transition: 'top 0.2s',
      }}
      onFocus={(e) => { e.currentTarget.style.top = '0'; }}
      onBlur={(e) => { e.currentTarget.style.top = '-100px'; }}
    >
      메인 콘텐츠로 이동
    </a>
  );
}
