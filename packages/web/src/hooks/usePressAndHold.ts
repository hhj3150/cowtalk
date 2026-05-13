// Push-to-Talk (PTT) — 누르고 있는 동안만 마이크 ON.
//
// 현장 UX 근거: 축사·착유장은 소음/장갑/위생 환경. iOS는 wake word도 불안정.
// "워키토키" 패턴이 가장 신뢰성 높고 의도가 명확하다.
//
// 동작:
//   - pointerDown → longPressMs 타이머 시작
//   - longPressMs(250ms) 경과 → onPressStart() — PTT 진입
//   - pointerUp/Cancel(PTT 진입 후) → onPressEnd() — STT 종료 + 전송
//   - pointerUp(PTT 진입 전) → onTap() — 기존 토글 동작
//
// 반환된 props는 button 등 클릭 가능한 요소에 spread하여 사용.

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UsePressAndHoldOptions {
  /** 짧게 탭(누르고 즉시 뗌) 시 호출. PTT 진입 전이면 onTap, 진입 후면 무시. */
  readonly onTap?: () => void;
  /** PTT 진입(longPressMs 경과) 시 호출. 마이크 시작 책임. */
  readonly onPressStart?: () => void;
  /** PTT 종료(뗌·취소·이탈) 시 호출. 마이크 정지/전송 책임. */
  readonly onPressEnd?: () => void;
  /** PTT 인식 임계값(ms). 기본 250ms. */
  readonly longPressMs?: number;
  /** disabled 시 모든 이벤트 무시. */
  readonly disabled?: boolean;
}

export interface UsePressAndHoldReturn {
  /** true = 현재 PTT 모드 진입 상태 (UI에서 "놓으면 전송" 등 표시). */
  readonly isHolding: boolean;
  /** button 등에 spread할 pointer 핸들러. */
  readonly handlers: {
    readonly onPointerDown: (e: React.PointerEvent) => void;
    readonly onPointerUp: (e: React.PointerEvent) => void;
    readonly onPointerCancel: (e: React.PointerEvent) => void;
    readonly onPointerLeave: (e: React.PointerEvent) => void;
    readonly onContextMenu: (e: React.MouseEvent) => void;
  };
}

export function usePressAndHold({
  onTap,
  onPressStart,
  onPressEnd,
  longPressMs = 250,
  disabled = false,
}: UsePressAndHoldOptions): UsePressAndHoldReturn {
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const isHoldingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const endHold = useCallback(() => {
    clearTimer();
    pointerIdRef.current = null;
    if (isHoldingRef.current) {
      isHoldingRef.current = false;
      setIsHolding(false);
      onPressEnd?.();
    }
  }, [clearTimer, onPressEnd]);

  // 언마운트 시 진행 중인 hold 정리 (누른 채로 컴포넌트가 사라지면 마이크가 안 꺼지는 사고 방지)
  useEffect(() => {
    return () => {
      clearTimer();
      if (isHoldingRef.current) {
        isHoldingRef.current = false;
        onPressEnd?.();
      }
    };
    // onPressEnd 변경은 cleanup에서만 사용 — eslint-disable for hooks/deps
    // 일부러 mount/unmount만 추적
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    // 마우스 우클릭/중간버튼 무시
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // 이미 다른 포인터로 hold 중이면 무시 (멀티터치 방어)
    if (pointerIdRef.current !== null) return;

    pointerIdRef.current = e.pointerId;
    // 손가락이 버튼 밖으로 나가도 pointerup을 받을 수 있도록 캡처
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch { /* ignore */ }

    clearTimer();
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      isHoldingRef.current = true;
      setIsHolding(true);
      onPressStart?.();
    }, longPressMs);
  }, [disabled, longPressMs, onPressStart, clearTimer]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    // 캡처 해제
    try {
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    } catch { /* ignore */ }

    if (pointerIdRef.current !== e.pointerId) return;

    const wasHolding = isHoldingRef.current;
    const timerActive = holdTimerRef.current !== null;

    if (timerActive && !wasHolding) {
      // longPressMs 전에 뗌 → 탭 (기존 토글 동작)
      clearTimer();
      pointerIdRef.current = null;
      onTap?.();
      return;
    }

    endHold();
  }, [disabled, clearTimer, endHold, onTap]);

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    endHold();
  }, [endHold]);

  // setPointerCapture 미지원 환경 대비 — 버튼 밖으로 나가도 PTT 유지하려면
  // capture가 동작해야 함. 폴백으로 leave에서 끝내지 않음 (의도된 hold 유지).
  // 단 capture가 실패한 경우(레거시)에만 leave가 의미. 안전을 위해 그대로 endHold.
  const onPointerLeave = useCallback((e: React.PointerEvent) => {
    // pointer capture가 잘 동작하면 leave는 발생하지 않음.
    // 발생했다면 capture 실패 → 마이크가 영구히 켜져 있는 사고를 막기 위해 종료.
    if (pointerIdRef.current !== e.pointerId) return;
    endHold();
  }, [endHold]);

  // 길게 누르기 = 모바일 컨텍스트 메뉴 트리거 → 차단
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return {
    isHolding,
    handlers: {
      onPointerDown,
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
      onContextMenu,
    },
  };
}
