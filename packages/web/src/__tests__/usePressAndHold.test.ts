// usePressAndHold — Push-to-Talk (PTT) 회귀 테스트
//
// 검증 (Day 3-4 P0-D):
// 1) 짧은 탭(<longPressMs)은 onTap만 호출, onPressStart/End는 호출 안 됨
// 2) 길게 누르기(≥longPressMs)는 onPressStart 호출, 뗄 때 onPressEnd 호출
// 3) PointerLeave/Cancel도 PTT를 안전하게 종료 (마이크 영구 켜짐 사고 방지)
// 4) 언마운트 시 진행 중인 hold가 onPressEnd로 정리됨
// 5) disabled 시 모든 이벤트 무시
// 6) 멀티터치 — 두 번째 포인터는 무시

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { usePressAndHold } from '@web/hooks/usePressAndHold';

function makePointerEvent(pointerId = 1, button = 0, pointerType = 'touch'): ReactPointerEvent {
  return {
    pointerId,
    button,
    pointerType,
    currentTarget: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    },
    preventDefault: vi.fn(),
  } as unknown as ReactPointerEvent;
}

describe('usePressAndHold — PTT', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('짧은 탭(<250ms)은 onTap만 호출', () => {
    const onTap = vi.fn();
    const onPressStart = vi.fn();
    const onPressEnd = vi.fn();
    const { result } = renderHook(() =>
      usePressAndHold({ onTap, onPressStart, onPressEnd, longPressMs: 250 })
    );

    act(() => {
      result.current.handlers.onPointerDown(makePointerEvent(1));
    });
    act(() => {
      vi.advanceTimersByTime(100); // 100ms < 250ms
      result.current.handlers.onPointerUp(makePointerEvent(1));
    });

    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onPressStart).not.toHaveBeenCalled();
    expect(onPressEnd).not.toHaveBeenCalled();
    expect(result.current.isHolding).toBe(false);
  });

  it('길게 누르기(≥250ms)는 onPressStart, 뗄 때 onPressEnd', () => {
    const onTap = vi.fn();
    const onPressStart = vi.fn();
    const onPressEnd = vi.fn();
    const { result } = renderHook(() =>
      usePressAndHold({ onTap, onPressStart, onPressEnd, longPressMs: 250 })
    );

    act(() => {
      result.current.handlers.onPointerDown(makePointerEvent(1));
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(result.current.isHolding).toBe(true);

    act(() => {
      result.current.handlers.onPointerUp(makePointerEvent(1));
    });

    expect(onPressEnd).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
    expect(result.current.isHolding).toBe(false);
  });

  it('PointerCancel도 PTT를 안전하게 종료', () => {
    const onPressStart = vi.fn();
    const onPressEnd = vi.fn();
    const { result } = renderHook(() =>
      usePressAndHold({ onPressStart, onPressEnd, longPressMs: 250 })
    );

    act(() => {
      result.current.handlers.onPointerDown(makePointerEvent(1));
      vi.advanceTimersByTime(300);
    });
    expect(result.current.isHolding).toBe(true);

    act(() => {
      result.current.handlers.onPointerCancel(makePointerEvent(1));
    });

    expect(onPressEnd).toHaveBeenCalledTimes(1);
    expect(result.current.isHolding).toBe(false);
  });

  it('PointerLeave도 PTT를 종료 (capture 실패 폴백)', () => {
    const onPressStart = vi.fn();
    const onPressEnd = vi.fn();
    const { result } = renderHook(() =>
      usePressAndHold({ onPressStart, onPressEnd, longPressMs: 250 })
    );

    act(() => {
      result.current.handlers.onPointerDown(makePointerEvent(1));
      vi.advanceTimersByTime(300);
    });

    act(() => {
      result.current.handlers.onPointerLeave(makePointerEvent(1));
    });

    expect(onPressEnd).toHaveBeenCalledTimes(1);
  });

  it('언마운트 시 진행 중 hold가 onPressEnd로 정리됨 (마이크 영구 ON 방지)', () => {
    const onPressStart = vi.fn();
    const onPressEnd = vi.fn();
    const { result, unmount } = renderHook(() =>
      usePressAndHold({ onPressStart, onPressEnd, longPressMs: 250 })
    );

    act(() => {
      result.current.handlers.onPointerDown(makePointerEvent(1));
      vi.advanceTimersByTime(300);
    });
    expect(onPressStart).toHaveBeenCalledTimes(1);

    unmount();

    expect(onPressEnd).toHaveBeenCalledTimes(1);
  });

  it('disabled 시 모든 이벤트 무시', () => {
    const onTap = vi.fn();
    const onPressStart = vi.fn();
    const { result } = renderHook(() =>
      usePressAndHold({ onTap, onPressStart, longPressMs: 250, disabled: true })
    );

    act(() => {
      result.current.handlers.onPointerDown(makePointerEvent(1));
      vi.advanceTimersByTime(300);
      result.current.handlers.onPointerUp(makePointerEvent(1));
    });

    expect(onTap).not.toHaveBeenCalled();
    expect(onPressStart).not.toHaveBeenCalled();
  });

  it('두 번째 포인터(멀티터치)는 무시 — pointerId 충돌 방어', () => {
    const onPressStart = vi.fn();
    const onPressEnd = vi.fn();
    const { result } = renderHook(() =>
      usePressAndHold({ onPressStart, onPressEnd, longPressMs: 250 })
    );

    act(() => {
      // 첫 번째 포인터 PTT 진입
      result.current.handlers.onPointerDown(makePointerEvent(1));
      vi.advanceTimersByTime(300);
    });
    expect(onPressStart).toHaveBeenCalledTimes(1);

    act(() => {
      // 두 번째 포인터 down — 무시되어야 함
      result.current.handlers.onPointerDown(makePointerEvent(2));
      vi.advanceTimersByTime(300);
    });
    expect(onPressStart).toHaveBeenCalledTimes(1); // 여전히 1

    act(() => {
      // 첫 번째 포인터 떼기
      result.current.handlers.onPointerUp(makePointerEvent(1));
    });
    expect(onPressEnd).toHaveBeenCalledTimes(1);
  });

  it('마우스 우클릭은 무시', () => {
    const onTap = vi.fn();
    const onPressStart = vi.fn();
    const { result } = renderHook(() =>
      usePressAndHold({ onTap, onPressStart, longPressMs: 250 })
    );

    act(() => {
      result.current.handlers.onPointerDown(makePointerEvent(1, 2, 'mouse')); // button=2 (우클릭)
      vi.advanceTimersByTime(300);
    });

    expect(onPressStart).not.toHaveBeenCalled();
  });
});
