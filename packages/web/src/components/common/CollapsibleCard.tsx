// 모바일 접기/펼치기 카드 — 기본 정보 외 섹션을 모바일에서 접어 두기
import React, { useState } from 'react';
import { useIsMobile } from '@web/hooks/useIsMobile';

interface CollapsibleCardProps {
  readonly title: string;
  readonly children: React.ReactNode;
  /** 모바일에서 기본 펼침 여부 (기본값: false = 접힘) */
  readonly defaultOpen?: boolean;
  /** 배지 텍스트 (예: 알림 건수) */
  readonly badge?: string | number | null;
  /** 배지 색상 */
  readonly badgeColor?: string;
}

export function CollapsibleCard({
  title,
  children,
  defaultOpen = false,
  badge,
  badgeColor = '#ef4444',
}: CollapsibleCardProps): React.JSX.Element {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(!isMobile || defaultOpen);

  // 데스크탑은 항상 열림
  const open = isMobile ? isOpen : true;

  return (
    <div style={{
      background: 'var(--ct-card)',
      border: '1px solid var(--ct-border)',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      {/* 헤더 — 모바일에서만 클릭 가능 */}
      <button
        type="button"
        onClick={() => { if (isMobile) setIsOpen((v) => !v); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '12px 14px',
          background: 'none',
          border: 'none',
          cursor: isMobile ? 'pointer' : 'default',
          textAlign: 'left',
          borderBottom: open ? '1px solid var(--ct-border)' : 'none',
          transition: 'border 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)' }}>{title}</span>
          {badge != null && badge !== '' && badge !== 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700,
              background: `${badgeColor}25`,
              color: badgeColor,
              padding: '1px 6px', borderRadius: 10,
              border: `1px solid ${badgeColor}40`,
            }}>
              {badge}
            </span>
          )}
        </div>
        {isMobile && (
          <span style={{
            fontSize: 14,
            color: 'var(--ct-text-muted)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            display: 'inline-block',
            lineHeight: 1,
          }}>
            ›
          </span>
        )}
      </button>

      {/* 콘텐츠 */}
      {open && (
        <div style={{ padding: 14 }}>
          {children}
        </div>
      )}
    </div>
  );
}
