// 에러 폴백 — 에러 메시지 + 재시도, CowTalk 디자인

import React from 'react';

interface Props {
  readonly error?: Error | null;
  readonly message?: string;
  readonly onRetry?: () => void;
}

export function ErrorFallback({ error, message, onRetry }: Props): React.JSX.Element {
  return (
    <div
      className="flex flex-col items-center justify-center p-6 text-center"
      style={{
        background: '#FEF2F2',
        border: '1px solid #FECACA',
        borderRadius: '12px',
      }}
    >
      <svg className="mb-3 h-10 w-10" style={{ color: 'var(--ct-danger)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      <p className="mb-1 text-sm font-medium" style={{ color: 'var(--ct-danger)' }}>
        {message ?? '데이터를 불러오는 중 오류가 발생했습니다.'}
      </p>
      {error && (
        <p className="mb-3 text-xs" style={{ color: '#B91C1C' }}>{error.message}</p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg px-4 py-1.5 text-sm font-medium text-white transition-colors"
          style={{ background: 'var(--ct-danger)' }}
        >
          다시 시도
        </button>
      )}
    </div>
  );
}
