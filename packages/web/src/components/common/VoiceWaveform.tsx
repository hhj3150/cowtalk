// 음성 파형 시각화 — VAD volume을 받아 막대 그래프로 표시.
//
// 목적: STT 체감 레이턴시 ↓. 사용자가 "마이크가 내 말을 듣고 있나?"를
// 즉시 확인할 수 있어야 한다. 파형이 움직이면 작동 중, 평평하면 무음.
//
// 디자인:
// - 작은 막대 N개, 가운데에서 양쪽으로 퍼지는 대칭 형태 (오디오 앱 표준)
// - volume(0~1)이 높을수록 막대가 길어짐 + 가운데서 멀어질수록 작아짐
// - 단순 SVG, framer-motion 없이 CSS transition만으로 부드러운 움직임
// - 별도 상태(보정 중/전사 중) 텍스트를 props로 받음 (외부에서 결정)

import React from 'react';

interface VoiceWaveformProps {
  /** 0~1 정규화된 현재 음량. */
  readonly volume: number;
  /** 표시할 막대 개수. 기본 12. */
  readonly bars?: number;
  /** 막대 색상. 기본 #ef4444 (listening 빨간색). */
  readonly color?: string;
  /** 컴포넌트 높이(px). 기본 28. */
  readonly height?: number;
  /** 상태 텍스트(보정 중/듣는 중/전사 중). 미지정 시 미표시. */
  readonly statusText?: string;
}

export function VoiceWaveform({
  volume,
  bars = 12,
  color = '#ef4444',
  height = 28,
  statusText,
}: VoiceWaveformProps): React.JSX.Element {
  const center = (bars - 1) / 2;
  // 가운데가 가장 크고 양쪽으로 갈수록 작아지는 가중치 + volume 반영
  const heights = Array.from({ length: bars }, (_, i) => {
    const distFromCenter = Math.abs(i - center) / center; // 0(center)~1(edge)
    const baseFalloff = 1 - distFromCenter * 0.6;
    // 살짝의 랜덤성으로 자연스럽게 (실제 오디오 같은 흔들림)
    const jitter = 0.85 + Math.sin(i * 1.7 + volume * 6) * 0.15;
    const h = Math.max(0.15, volume * baseFalloff * jitter);
    return Math.min(1, h);
  });

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={statusText ?? '음성 입력 중'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          height,
          minWidth: bars * 5,
        }}
      >
        {heights.map((h, i) => (
          <div
            key={i}
            style={{
              width: 3,
              height: `${h * 100}%`,
              background: color,
              borderRadius: 1.5,
              transition: 'height 80ms ease-out',
              opacity: 0.6 + h * 0.4,
            }}
          />
        ))}
      </div>
      {statusText && (
        <span style={{
          fontSize: 12,
          color: 'var(--ct-text-muted, #94a3b8)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {statusText}
        </span>
      )}
    </div>
  );
}
