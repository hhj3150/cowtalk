// 수의사 진료센터 공용 UI 헬퍼 — 현장 모바일 우선(큰 버튼/카드형/고대비)
import React from 'react';

export function VetCard({ children, className = '' }: { children: React.ReactNode; className?: string }): React.JSX.Element {
  return (
    <div
      className={`rounded-xl p-4 ${className}`}
      style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)' }}
    >
      {children}
    </div>
  );
}

export function VetButton({
  children, onClick, variant = 'default', disabled = false, type = 'button', title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
}): React.JSX.Element {
  const styles: Record<string, React.CSSProperties> = {
    default: { background: 'var(--ct-card)', border: '1px solid var(--ct-border)', color: 'var(--ct-text)' },
    primary: { background: 'var(--ct-primary, #7c3aed)', border: '1px solid var(--ct-primary, #7c3aed)', color: '#fff' },
    ghost: { background: 'transparent', border: '1px solid transparent', color: 'var(--ct-text-secondary)' },
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

export function VetTabBar({
  tabs, active, onChange,
}: {
  tabs: ReadonlyArray<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}): React.JSX.Element {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1" role="tablist">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className="min-h-[40px] whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition"
            style={{
              background: isActive ? 'var(--ct-primary, #7c3aed)' : 'var(--ct-card)',
              color: isActive ? '#fff' : 'var(--ct-text-secondary)',
              border: '1px solid var(--ct-border)',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// snapshot 객체를 "키: 값" 목록으로 렌더 (값이 객체/배열이면 JSON 요약)
export function KeyValueList({ data }: { data: Record<string, unknown> }): React.JSX.Element {
  const entries = Object.entries(data).filter(([k]) => !k.startsWith('_'));
  if (entries.length === 0) {
    return <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>데이터 없음</p>;
  }
  return (
    <dl className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2 text-sm">
          <dt style={{ color: 'var(--ct-text-secondary)' }}>{k}</dt>
          <dd className="text-right font-medium" style={{ color: 'var(--ct-text)' }}>{formatVal(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length === 0 ? '—' : `${v.length}건`;
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? '예' : '아니오';
  return String(v);
}
