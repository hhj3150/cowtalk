// 최종 업데이트 표시 + 수동 새로고침

import React from 'react';

interface Props {
  readonly lastUpdated: Date;
  readonly onRefresh: () => void;
}

export function LastUpdated({ lastUpdated, onRefresh }: Props): React.JSX.Element {
  const timeStr = lastUpdated.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
      <span>최종 업데이트: {timeStr}</span>
      <button
        type="button"
        onClick={onRefresh}
        className="rounded-lg p-1 transition-colors hover:bg-[#F0F0EE]"
        aria-label="새로고침"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M21.015 4.356v4.992" />
        </svg>
      </button>
    </div>
  );
}
