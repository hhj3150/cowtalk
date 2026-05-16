// 유효 역할 훅 — 시뮬레이션 중이면 시뮬레이션 역할, 아니면 본 계정 역할 (FLOW-02 Step2.5)
//
// KPI / AI 브리핑 / 사이드바 / 헤더 배지 등 "역할별 화면"은 이 훅의 값을 따른다.
// 라우트 가드(App.tsx RequireRole) 등 신원·권한 판정은 본 계정 user.role 을 그대로 쓴다.

import { useAuthStore } from '@web/stores/auth.store';
import { useRoleSimulationStore } from '@web/stores/role-simulation.store';
import type { Role } from '@cowtalk/shared';

/**
 * 화면 렌더용 유효 역할.
 * - 시뮬레이션 중(master): simulatedRole
 * - 그 외: 본 계정 user.role
 * 반환값은 기존 `user?.role` 과 동일하게 undefined 가능 — 호출처가 기존 폴백을 유지한다.
 */
export function useEffectiveRole(): Role | undefined {
  const userRole = useAuthStore((s) => s.user?.role);
  const simulatedRole = useRoleSimulationStore((s) => s.simulatedRole);
  return simulatedRole ?? userRole;
}
