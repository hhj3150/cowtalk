// 근교계수 게이지

import React from 'react';

interface Props {
  readonly coefficient: number; // 0-1 (0% ~ 100%)
}

export function InbreedingGauge({ coefficient }: Props): React.JSX.Element {
  const pct = Math.min(coefficient * 100, 100);
  const color = pct > 6.25 ? '#ef4444' : pct > 3.125 ? '#f97316' : '#22c55e';
  const label = pct > 6.25 ? '위험' : pct > 3.125 ? '주의' : '양호';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-700">근교계수</span>
        <span className="text-xs font-bold" style={{ color }}>{pct.toFixed(2)}% ({label})</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${Math.min(pct * 8, 100)}%`, backgroundColor: color }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>0%</span>
        <span>3.125%</span>
        <span>6.25%</span>
        <span>12.5%</span>
      </div>
    </div>
  );
}
