// 로딩 스켈레톤 — CowTalk 디자인

import React from 'react';

interface Props {
  readonly lines?: number;
  readonly className?: string;
}

export function LoadingSkeleton({ lines = 3, className = '' }: Props): React.JSX.Element {
  return (
    <div className={`animate-pulse space-y-3 p-4 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-4 rounded-lg"
          style={{
            width: `${Math.max(40, 100 - i * 15)}%`,
            background: 'var(--ct-border)',
          }}
        />
      ))}
    </div>
  );
}
