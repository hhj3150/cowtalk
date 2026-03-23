// 위험 등급 배지 컴포넌트
// 🟢 안전 / 🟡 주의 / 🟠 경계 / 🔴 심각

import React from 'react';

export type RiskLevel = 'green' | 'yellow' | 'orange' | 'red';

const RISK_CONFIG: Record<RiskLevel, {
  label: string;
  emoji: string;
  bg: string;
  text: string;
  border: string;
  pulse: boolean;
}> = {
  green: {
    label: '안전',
    emoji: '🟢',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    pulse: false,
  },
  yellow: {
    label: '주의',
    emoji: '🟡',
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
    pulse: false,
  },
  orange: {
    label: '경계',
    emoji: '🟠',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    pulse: true,
  },
  red: {
    label: '심각',
    emoji: '🔴',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    pulse: true,
  },
};

interface Props {
  level: RiskLevel;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function RiskLevelBadge({ level, size = 'md', showLabel = true }: Props): React.JSX.Element {
  const cfg = RISK_CONFIG[level];

  const sizeClass =
    size === 'sm' ? 'text-xs px-2 py-0.5' :
    size === 'lg' ? 'text-base px-4 py-2 font-bold' :
    'text-sm px-3 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${sizeClass} ${cfg.bg} ${cfg.text} ${cfg.border} ${cfg.pulse ? 'animate-pulse' : ''}`}
    >
      <span>{cfg.emoji}</span>
      {showLabel && <span>{cfg.label}</span>}
    </span>
  );
}

// 위험 등급 대형 배너 (대시보드 상단)
interface BannerProps {
  level: RiskLevel;
  subtitle?: string;
}

export function RiskLevelBanner({ level, subtitle }: BannerProps): React.JSX.Element {
  const cfg = RISK_CONFIG[level];

  const bannerBg =
    level === 'red' ? 'bg-red-600' :
    level === 'orange' ? 'bg-orange-500' :
    level === 'yellow' ? 'bg-yellow-400' :
    'bg-emerald-500';

  return (
    <div className={`rounded-xl p-4 text-white ${bannerBg} ${level === 'red' ? 'animate-pulse' : ''}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-90">현재 방역 위험 등급</p>
          <p className="text-3xl font-bold mt-0.5">
            {cfg.emoji} {cfg.label}
          </p>
          {subtitle && <p className="text-sm opacity-80 mt-1">{subtitle}</p>}
        </div>
        <div className="text-5xl opacity-30 font-black">
          {level.toUpperCase()}
        </div>
      </div>
    </div>
  );
}
