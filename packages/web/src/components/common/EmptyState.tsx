// 빈 상태 안내 — CowTalk 디자인

import React from 'react';

interface Props {
  readonly message?: string;
  readonly icon?: React.ReactNode;
}

export function EmptyState({ message = '데이터가 없습니다.', icon }: Props): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center" style={{ color: 'var(--ct-text-secondary)' }}>
      {icon ?? (
        <svg className="mb-3 h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      )}
      <p className="text-sm">{message}</p>
    </div>
  );
}
