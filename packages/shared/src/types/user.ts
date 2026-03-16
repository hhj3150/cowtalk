// 사용자 + 역할 + 권한

import type { Timestamp, SoftDelete } from './common';

export type Role =
  | 'farmer'
  | 'veterinarian'
  | 'inseminator'
  | 'government_admin'
  | 'quarantine_officer'
  | 'feed_company';

export type UserStatus = 'active' | 'inactive' | 'suspended';

export type PermissionLevel = 'read' | 'write' | 'admin';

export type ResourceType =
  | 'farm'
  | 'animal'
  | 'sensor'
  | 'prediction'
  | 'alert'
  | 'action'
  | 'feedback'
  | 'regional'
  | 'user'
  | 'system';

export type ActionType = 'read' | 'create' | 'update' | 'delete' | 'export';

export interface User extends Timestamp, SoftDelete {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: Role;
  readonly status: UserStatus;
  readonly lastLoginAt: Date | null;
}

export interface UserFarmAccess {
  readonly userId: string;
  readonly farmId: string;
  readonly permissionLevel: PermissionLevel;
}

export interface Permission {
  readonly role: Role;
  readonly resource: ResourceType;
  readonly actions: readonly ActionType[];
}

export interface RoleConfig {
  readonly role: Role;
  readonly label: string;
  readonly labelKo: string;
  readonly scope: 'farm' | 'multi_farm' | 'region' | 'national';
  readonly focusAreas: readonly string[];
  readonly alertPriority: readonly string[];
}

export interface AuditLogEntry {
  readonly auditId: string;
  readonly userId: string;
  readonly action: string;
  readonly resource: ResourceType;
  readonly resourceId: string | null;
  readonly details: Record<string, unknown> | null;
  readonly ipAddress: string | null;
  readonly timestamp: Date;
}

export interface AuthTokenPayload {
  readonly userId: string;
  readonly role: Role;
  readonly farmIds: readonly string[];
}
