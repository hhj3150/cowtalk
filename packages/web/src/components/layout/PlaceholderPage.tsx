// 준비 중 라우트용 공통 placeholder (FLOW-02 Step3)
// D9: mock 데이터 절대 표시 안 함 — 정직한 빈 상태만.

import React from 'react';

interface PlaceholderPageProps {
  readonly title: string;
  readonly subtitle: string;
  readonly description: string;
}

export function PlaceholderPage({ title, subtitle, description }: PlaceholderPageProps): React.JSX.Element {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--ct-text)' }}>{title}</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ct-text-secondary)' }}>{subtitle}</p>
      </header>
      <div
        className="rounded-lg border border-dashed p-12 text-center"
        style={{ borderColor: 'var(--ct-border)' }}
      >
        <p className="mb-2 text-3xl" style={{ color: 'var(--ct-text-muted)' }}>—</p>
        <p className="text-base font-medium" style={{ color: 'var(--ct-text)' }}>준비 중</p>
        <p className="mx-auto mt-4 max-w-md text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
          {description}
        </p>
        <p className="mt-6 text-xs italic" style={{ color: 'var(--ct-text-muted)' }}>
          향후 PR에서 구축 예정 — mock 데이터는 표시하지 않습니다.
        </p>
      </div>
    </div>
  );
}
