// 마이크 버튼 — 음성 입력용 공용 컴포넌트
//
// 두 가지 사용 모드:
// 1) Tap-toggle (기존): onClick — 탭하면 listening 토글
// 2) Push-to-Talk (PTT, 신규): onPressStart/onPressEnd — 누르고 있는 동안만 마이크 ON
//
// 두 모드 동시 사용 가능 — 짧은 탭은 onClick, 길게 누르기(≥250ms)는 PTT로 분기.

import React from 'react';
import { usePressAndHold } from '@web/hooks/usePressAndHold';

interface MicButtonProps {
  readonly isListening: boolean;
  /** 짧은 탭 시 호출 (기존 토글 동작). PTT 진입 후에는 호출되지 않음. */
  readonly onClick?: () => void;
  /** PTT 진입 시 (≥longPressMs 누름). 지정 시 PTT 모드 활성화. */
  readonly onPressStart?: () => void;
  /** PTT 종료 시 (뗌·취소·이탈). */
  readonly onPressEnd?: () => void;
  /** PTT 인식 임계값(ms). 기본 250ms. */
  readonly longPressMs?: number;
  readonly disabled?: boolean;
  readonly size?: number;
}

export function MicButton({
  isListening,
  onClick,
  onPressStart,
  onPressEnd,
  longPressMs = 250,
  disabled,
  size = 36,
}: MicButtonProps): React.JSX.Element {
  const pttEnabled = Boolean(onPressStart || onPressEnd);
  const { isHolding, handlers } = usePressAndHold({
    onTap: onClick,
    onPressStart,
    onPressEnd,
    longPressMs,
    disabled: disabled || !pttEnabled,
  });

  // PTT 미사용 시 기존 onClick 동작 유지 (호환성)
  const tapOnlyHandler = !pttEnabled && onClick ? onClick : undefined;

  const activeStyle = isListening || isHolding;

  return (
    <button
      type="button"
      onClick={tapOnlyHandler}
      disabled={disabled}
      aria-label={
        isHolding
          ? '듣는 중 — 떼면 전송'
          : isListening
            ? '듣기 중지'
            : pttEnabled
              ? '음성으로 질문 (길게 눌러 말하기)'
              : '음성으로 질문하기'
      }
      aria-pressed={activeStyle}
      {...(pttEnabled ? handlers : {})}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: activeStyle ? '#ef4444' : 'rgba(255,255,255,0.08)',
        border: activeStyle ? '2px solid #ef4444' : '1px solid var(--ct-border, #334155)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 0.15s',
        // PTT 진입 시 더 강한 펄스 (사용자가 "마이크 켜졌다"는 신호를 즉시 받음)
        animation: isHolding
          ? 'mic-pulse-hold 0.6s ease-in-out infinite'
          : isListening
            ? 'mic-pulse 1s ease-in-out infinite'
            : undefined,
        opacity: disabled ? 0.5 : 1,
        // 길게 누르기 시 텍스트 선택/하이라이트 방지
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        touchAction: 'manipulation',
        // 아주 살짝 커지는 시각 효과 (햅틱 대체)
        transform: isHolding ? 'scale(1.08)' : 'scale(1)',
      }}
    >
      <svg
        aria-hidden="true"
        width={size * 0.45}
        height={size * 0.45}
        viewBox="0 0 24 24"
        fill="none"
        stroke={activeStyle ? 'white' : 'var(--ct-text-muted, #94a3b8)'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
      </svg>
      {(isListening || isHolding) && (
        <style>{`
          @keyframes mic-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
            50% { box-shadow: 0 0 12px 4px rgba(239,68,68,0.2); }
          }
          @keyframes mic-pulse-hold {
            0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.6); }
            50% { box-shadow: 0 0 18px 8px rgba(239,68,68,0.35); }
          }
        `}</style>
      )}
    </button>
  );
}
