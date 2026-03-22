// 역할 기반 대시보드 훅
// auth store에서 역할을 읽어 위젯 가시성을 결정

import { useAuthStore } from '@web/stores/auth.store';
import { isWidgetVisible, ROLE_LABELS } from '@web/config/dashboard-widgets';
import type { DashboardWidgetId } from '@web/config/dashboard-widgets';
import type { Role } from '@cowtalk/shared';

interface RoleDashboard {
  readonly role: Role;
  readonly roleLabel: string;
  readonly isVisible: (widgetId: DashboardWidgetId) => boolean;
  readonly isFarmer: boolean;
  readonly isAdmin: boolean;
}

export function useRoleDashboard(): RoleDashboard {
  const role = useAuthStore((s) => s.user?.role ?? 'government_admin') as Role;

  return {
    role,
    roleLabel: ROLE_LABELS[role] ?? role,
    isVisible: (widgetId: DashboardWidgetId) => isWidgetVisible(role, widgetId),
    isFarmer: role === 'farmer',
    isAdmin: role === 'government_admin',
  };
}
