// CSV/Excel 다운로드 버튼 — CowTalk 디자인

import React, { useState } from 'react';
import { downloadExport, type ExportTarget, type ExportFormat } from '@web/api/export.api';

interface Props {
  readonly target: ExportTarget;
  readonly params?: Record<string, unknown>;
  readonly label?: string;
}

export function ExportButton({ target, params, label = '내보내기' }: Props): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(format: ExportFormat): Promise<void> {
    setIsExporting(true);
    setIsOpen(false);
    setError(null);
    try {
      await downloadExport(target, format, params);
    } catch {
      setError('내보내기에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
        style={{
          borderColor: 'var(--ct-border)',
          background: 'var(--ct-card)',
          color: 'var(--ct-text-secondary)',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ct-primary)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ct-border)'; }}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        {isExporting ? '내보내는 중...' : label}
      </button>
      {isOpen && (
        <div className="absolute right-0 z-10 mt-1 rounded-xl py-1 shadow-lg ct-card">
          <button
            type="button"
            onClick={() => { handleExport('csv'); }}
            className="block w-full px-4 py-2 text-left text-sm transition-colors hover:bg-[#F0FAF5]"
            style={{ color: 'var(--ct-text)' }}
          >
            CSV 다운로드
          </button>
          <button
            type="button"
            onClick={() => { handleExport('excel'); }}
            className="block w-full px-4 py-2 text-left text-sm transition-colors hover:bg-[#F0FAF5]"
            style={{ color: 'var(--ct-text)' }}
          >
            Excel 다운로드
          </button>
        </div>
      )}
      {error && (
        <div
          role="alert"
          style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 10,
            padding: '6px 10px', borderRadius: 8, fontSize: 12, whiteSpace: 'nowrap',
            background: 'rgba(239,68,68,0.12)', color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.35)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
