// 브레드크럼 — 요약 > 농장 > 동물 > 상세

import React from 'react';
import { useDrilldownStore } from '@web/stores/drilldown.store';

export function Breadcrumb(): React.JSX.Element {
  const { title, history, goBack } = useDrilldownStore();

  const crumbs = [...history.map((h) => h.title), title];

  return (
    <nav className="flex items-center gap-1 text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
      {crumbs.map((crumb, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: 'var(--ct-border)' }}>/</span>}
          {i < crumbs.length - 1 ? (
            <button
              type="button"
              onClick={() => {
                for (let j = crumbs.length - 1; j > i; j--) {
                  goBack();
                }
              }}
              className="hover:underline"
              style={{ color: 'var(--ct-text-secondary)' }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'var(--ct-primary)'; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'var(--ct-text-secondary)'; }}
            >
              {crumb}
            </button>
          ) : (
            <span className="font-medium" style={{ color: 'var(--ct-text)' }}>{crumb}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
