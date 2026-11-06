// 폐루프 건강관리 API — 감지 → 개입 → 센서 검증 → 수의사 확정

import { apiGet } from './client';
import type { ClosedLoopStatus, ClosedLoopProtocolSummary } from '@cowtalk/shared';

export function fetchClosedLoopStatus(farmId: string, days = 14): Promise<ClosedLoopStatus> {
  return apiGet<ClosedLoopStatus>(`/closed-loop/farm/${farmId}`, { days });
}

export function fetchClosedLoopProtocols(): Promise<readonly ClosedLoopProtocolSummary[]> {
  return apiGet<readonly ClosedLoopProtocolSummary[]>('/closed-loop/protocols');
}
