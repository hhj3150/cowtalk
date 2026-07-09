// 위젯 헤더 액센트 바 — 헤더 이모지 대체 (관제센터 톤 통일)
// ChartCard/FarmMapWidget 헤더와 동일한 3×14 라운드 바.

import React from 'react';

export function TitleAccentBar({ color = 'var(--ct-primary)', style }: {
  readonly color?: string;
  readonly style?: React.CSSProperties;
}): React.JSX.Element {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 3,
        height: 14,
        borderRadius: 2,
        background: color,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
