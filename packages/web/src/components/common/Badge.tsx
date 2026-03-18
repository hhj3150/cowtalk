// 상태/우선순위 배지 — CowTalk 디자인 시스템

import React from 'react';

type Variant = 'critical' | 'high' | 'medium' | 'low' | 'normal' | 'info' | 'success';

interface Props {
  readonly label: string;
  readonly variant?: Variant;
  readonly className?: string;
}

const VARIANT_STYLES: Record<Variant, { bg: string; text: string; border: string }> = {
  critical: { bg: '#FEE2E2', text: '#E24B4A', border: '#FECACA' },
  high: { bg: '#FEF3C7', text: '#D97706', border: '#FDE68A' },
  medium: { bg: '#FEF9C3', text: '#A16207', border: '#FEF08A' },
  low: { bg: '#DBEAFE', text: '#378ADD', border: '#BFDBFE' },
  normal: { bg: '#E1F5EE', text: '#1D9E75', border: '#A7F3D0' },
  info: { bg: '#F5F5F3', text: '#888880', border: '#E5E5E3' },
  success: { bg: '#E1F5EE', text: '#1D9E75', border: '#A7F3D0' },
};

export function Badge({ label, variant = 'info', className = '' }: Props): React.JSX.Element {
  const s = VARIANT_STYLES[variant];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}
      style={{ background: s.bg, color: s.text, borderColor: s.border }}
    >
      {label}
    </span>
  );
}

export function severityToBadgeVariant(severity: string): Variant {
  switch (severity) {
    case 'critical': return 'critical';
    case 'high': return 'high';
    case 'medium': return 'medium';
    case 'low': return 'low';
    default: return 'info';
  }
}
