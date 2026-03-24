// 마이크 버튼 — 음성 입력용 공용 컴포넌트

import React from 'react';

interface MicButtonProps {
  readonly isListening: boolean;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly size?: number;
}

export function MicButton({ isListening, onClick, disabled, size = 36 }: MicButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={isListening ? '듣기 중지' : '음성으로 질문하기'}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: isListening ? '#ef4444' : 'rgba(255,255,255,0.08)',
        border: isListening ? '2px solid #ef4444' : '1px solid var(--ct-border, #334155)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 0.2s',
        animation: isListening ? 'mic-pulse 1s ease-in-out infinite' : undefined,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <svg
        aria-hidden="true"
        width={size * 0.45}
        height={size * 0.45}
        viewBox="0 0 24 24"
        fill="none"
        stroke={isListening ? 'white' : 'var(--ct-text-muted, #94a3b8)'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
      </svg>
      {isListening && (
        <style>{`
          @keyframes mic-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
            50% { box-shadow: 0 0 12px 4px rgba(239,68,68,0.2); }
          }
        `}</style>
      )}
    </button>
  );
}
