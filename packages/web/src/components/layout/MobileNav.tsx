// 모바일 네비게이션 — 햄버거 메뉴

import React, { useEffect } from 'react';
import { Sidebar } from './Sidebar';

interface Props {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function MobileNav({ isOpen, onClose }: Props): React.JSX.Element | null {
  // ESC 키로 닫기
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
    return undefined;
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      {/* 백드롭 */}
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />

      {/* 사이드바 */}
      <div className="relative z-50 w-64">
        <Sidebar />
      </div>
    </div>
  );
}
