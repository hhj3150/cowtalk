// 6역할 정의 + 권한 매트릭스 (v4 roleConfig.js 이식)

import type { Role, RoleConfig, Permission, ResourceType, ActionType } from '../types/user.js';

export const ROLES: readonly RoleConfig[] = [
  {
    role: 'farmer',
    label: 'Farmer',
    labelKo: '농장주',
    scope: 'farm',
    focusAreas: ['health_alerts', 'estrus_today', 'feeding_issues', 'daily_tasks'],
    alertPriority: ['health_risk', 'estrus_candidate', 'feeding_metabolic_risk'],
  },
  {
    role: 'veterinarian',
    label: 'Veterinarian',
    labelKo: '수의사',
    scope: 'multi_farm',
    focusAreas: ['critical_health', 'disease_risk', 'treatment_priority', 'herd_health'],
    alertPriority: ['health_risk', 'herd_anomaly', 'feeding_metabolic_risk'],
  },
  {
    role: 'inseminator',
    label: 'Inseminator',
    labelKo: '수정사',
    scope: 'multi_farm',
    focusAreas: ['estrus_candidates', 'breeding_schedule', 'optimal_timing', 'pregnancy_status'],
    alertPriority: ['estrus_candidate', 'productivity_drop'],
  },
  {
    role: 'government_admin',
    label: 'Government Admin',
    labelKo: '지자체 관리자',
    scope: 'region',
    focusAreas: ['region_summary', 'farm_alert_counts', 'estrus_trends', 'policy_briefing'],
    alertPriority: ['regional_warning', 'herd_anomaly', 'health_risk'],
  },
  {
    role: 'quarantine_officer',
    label: 'Quarantine Officer',
    labelKo: '방역관',
    scope: 'region',
    focusAreas: ['temperature_anomalies', 'cluster_detection', 'multi_symptom_farms', 'quarantine_status'],
    alertPriority: ['health_risk', 'herd_anomaly', 'regional_warning'],
  },
  {
    role: 'feed_company',
    label: 'Feed Company',
    labelKo: '사료회사',
    scope: 'multi_farm',
    focusAreas: ['rumination_drop', 'productivity_decline', 'nutrition_issues', 'feed_efficiency'],
    alertPriority: ['feeding_metabolic_risk', 'productivity_drop'],
  },
] as const;

export const ROLE_MAP: Readonly<Record<Role, RoleConfig>> = Object.fromEntries(
  ROLES.map((r) => [r.role, r]),
) as Record<Role, RoleConfig>;

// 권한 매트릭스: 역할 × 리소스 × 액션
const ALL_ACTIONS: readonly ActionType[] = ['read', 'create', 'update', 'delete', 'export'];
const READ_ONLY: readonly ActionType[] = ['read'];
const READ_EXPORT: readonly ActionType[] = ['read', 'export'];
const READ_CREATE: readonly ActionType[] = ['read', 'create'];
const READ_CREATE_UPDATE: readonly ActionType[] = ['read', 'create', 'update'];

type PermissionMatrix = Readonly<Record<Role, Readonly<Record<ResourceType, readonly ActionType[]>>>>;

export const PERMISSION_MATRIX: PermissionMatrix = {
  farmer: {
    farm: READ_ONLY,
    animal: READ_CREATE_UPDATE,
    sensor: READ_ONLY,
    prediction: READ_ONLY,
    alert: READ_CREATE_UPDATE,
    action: READ_CREATE_UPDATE,
    feedback: READ_CREATE,
    regional: [],
    user: READ_ONLY,
    system: [],
  },
  veterinarian: {
    farm: READ_ONLY,
    animal: READ_CREATE_UPDATE,
    sensor: READ_ONLY,
    prediction: READ_ONLY,
    alert: READ_CREATE_UPDATE,
    action: READ_CREATE_UPDATE,
    feedback: READ_CREATE,
    regional: READ_ONLY,
    user: READ_ONLY,
    system: [],
  },
  inseminator: {
    farm: READ_ONLY,
    animal: READ_CREATE_UPDATE,
    sensor: READ_ONLY,
    prediction: READ_ONLY,
    alert: READ_CREATE_UPDATE,
    action: READ_CREATE_UPDATE,
    feedback: READ_CREATE,
    regional: [],
    user: READ_ONLY,
    system: [],
  },
  government_admin: {
    farm: READ_EXPORT,
    animal: READ_EXPORT,
    sensor: READ_ONLY,
    prediction: READ_EXPORT,
    alert: READ_EXPORT,
    action: READ_ONLY,
    feedback: READ_ONLY,
    regional: READ_EXPORT,
    user: ALL_ACTIONS,
    system: READ_ONLY,
  },
  quarantine_officer: {
    farm: READ_EXPORT,
    animal: READ_EXPORT,
    sensor: READ_ONLY,
    prediction: READ_EXPORT,
    alert: READ_CREATE_UPDATE,
    action: READ_CREATE_UPDATE,
    feedback: READ_CREATE,
    regional: READ_EXPORT,
    user: READ_ONLY,
    system: READ_ONLY,
  },
  feed_company: {
    farm: READ_ONLY,
    animal: READ_ONLY,
    sensor: READ_ONLY,
    prediction: READ_ONLY,
    alert: READ_ONLY,
    action: READ_ONLY,
    feedback: READ_CREATE,
    regional: [],
    user: READ_ONLY,
    system: [],
  },
} as const;

export function hasPermission(role: Role, resource: ResourceType, action: ActionType): boolean {
  const permissions = PERMISSION_MATRIX[role][resource];
  return permissions.includes(action);
}

export function getPermissionsForRole(role: Role): readonly Permission[] {
  const entries = Object.entries(PERMISSION_MATRIX[role]) as [ResourceType, readonly ActionType[]][];
  return entries
    .filter(([_, actions]) => actions.length > 0)
    .map(([resource, actions]) => ({
      role,
      resource,
      actions,
    }));
}
