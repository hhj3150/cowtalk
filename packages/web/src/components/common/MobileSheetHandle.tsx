// 바닥시트 드래그 핸들 — 시트 상단에 위치, 스와이프 다운으로 시트 닫기.
//
// 모바일 바닥시트 패턴(iOS Maps, Apple Music, Slack 등)의 표준 어포던스:
// - 회색 둥근 막대 (사용자가 잡을 수 있음을 시각적으로 알림)
// - 아래로 드래그 → 일정 거리(thresholdPx) 초과 시 닫기
// - 짧은 거리만 드래그 → 원위치로 spring
//
// 사용자 의도 신뢰성:
// - 50px 이상 드래그 = 닫기 의사
// - 50px 미만 = 우발적 터치 → 원위치
// - touch + mouse 모두 대응 (pointer events)

import React, { useCallback, useRef, useState } from 'react';

interface MobileSheetHandleProps {
  readonly color: string;
  readonly stateLabel: string;
  readonly unread: number;
  readonly onClose: () => void;
}

const CLOSE_THRESHOLD_PX = 60;

export function MobileSheetHandle({ color, stateLabel, unread, onClose }: MobileSheetHandleProps): React.JSX.Element {
  const [dragY, setDragY] = useState(0);
  const dragStartYRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerIdRef.current = e.pointerId;
    dragStartYRef.current = e.clientY;
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId || dragStartYRef.current === null) return;
    const dy = e.clientY - dragStartYRef.current;
    // 위로 드래그(음수)는 0으로 클램프 — 시트는 위로 늘어나지 않음
    setDragY(Math.max(0, dy));
  }, []);

  const finish = useCallback((commit: boolean) => {
    const shouldClose = commit && dragY >= CLOSE_THRESHOLD_PX;
    if (shouldClose) {
      onClose();
    }
    setDragY(0);
    dragStartYRef.current = null;
    pointerIdRef.current = null;
  }, [dragY, onClose]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    try { (e.currentTarget as Element).releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    finish(true);
  }, [finish]);

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    finish(false);
  }, [finish]);

  // 드래그 거리에 따라 시트 살짝 따라 움직이는 효과 — 시각 피드백
  // parent containerStyle에 직접 영향을 못 주므로, 핸들 영역만 따라 움직임.
  // (시트 전체 transform은 컨테이너 레벨로 빼는 게 이상적이지만 큰 리팩토링 필요)
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="팅커벨 시트 닫기 (아래로 드래그)"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || e.key === 'ArrowDown') onClose();
      }}
      style={{
        flexShrink: 0,
        padding: '8px 16px 6px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor: 'grab',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        transition: dragY === 0 ? 'opacity 0.15s' : 'none',
        opacity: 1 - Math.min(0.4, dragY / 200),
        background: 'transparent',
      }}
    >
      {/* 핸들 막대 */}
      <div
        aria-hidden="true"
        style={{
          width: 40,
          height: 4,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.25)',
          marginBottom: 6,
        }}
      />
      {/* 라벨 + 상태 + 미읽음 (있을 때만) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 14 }} aria-hidden="true">🧚</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text, #f1f5f9)', whiteSpace: 'nowrap' }}>
            팅커벨 AI
          </span>
          <span style={{ fontSize: 10, color, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {stateLabel}
          </span>
          {unread > 0 && (
            <span style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 8,
              background: '#ef4444',
              color: 'white',
              fontWeight: 700,
            }}>
              +{unread}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          aria-label="팅커벨 닫기"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--ct-text-muted, #94a3b8)',
            cursor: 'pointer',
            fontSize: 18,
            padding: '2px 6px',
            lineHeight: 1,
          }}
        >✕</button>
      </div>
    </div>
  );
}
