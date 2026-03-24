// 드릴다운 경로 표시 컴포넌트
// 전국 > 경기도 > 별빛목장 > 개체 #A234

import React from 'react';

export interface BreadcrumbItem {
  readonly label: string;
  readonly onClick?: () => void;
}

interface Props {
  readonly items: readonly BreadcrumbItem[];
}

export function BreadcrumbNav({ items }: Props): React.JSX.Element {
  return (
    <nav className="flex items-center flex-wrap gap-1 text-xs">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <React.Fragment key={`${item.label}-${index}`}>
            {isLast ? (
              <span className="font-semibold" style={{ color: 'var(--ct-text)' }}>
                {item.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={item.onClick}
                className="transition-opacity hover:opacity-70"
                style={{ color: 'var(--ct-primary, #3b82f6)' }}
              >
                {item.label}
              </button>
            )}
            {!isLast && (
              <span className="select-none" style={{ color: 'var(--ct-text-secondary)' }}>
                ›
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
