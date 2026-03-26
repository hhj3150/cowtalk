// 이표 스캔 페이지 — /scan

import React from 'react';
import { EarTagScanner } from '@web/components/ear-tag/EarTagScanner';

export default function EarTagScanPage(): React.JSX.Element {
  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--ct-bg)' }}>
      <div className="pt-6">
        <EarTagScanner />
      </div>
    </div>
  );
}
