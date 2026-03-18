// 액션 플랜 + 추천

import type { Severity } from './common.js';
import type { Role } from './user.js';
import type { EngineType } from './prediction.js';

export type ActionStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'overdue';

export type ActionCategory =
  | 'immediate'       // 즉시 조치
  | 'scheduled'       // 예정된 작업
  | 'monitoring'      // 모니터링 지속
  | 'preventive';     // 예방 조치

export interface ActionRecommendation {
  readonly actionId: string;
  readonly predictionId: string | null;
  readonly alertId: string | null;
  readonly engineType: EngineType;
  readonly animalId: string | null;
  readonly farmId: string;
  readonly targetRole: Role;
  readonly category: ActionCategory;
  readonly priority: Severity;
  readonly title: string;
  readonly description: string;
  readonly steps: readonly ActionStep[];
  readonly deadline: Date | null;
  readonly status: ActionStatus;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
  readonly completedBy: string | null;
}

export interface ActionStep {
  readonly order: number;
  readonly description: string;
  readonly isCompleted: boolean;
}

export interface ActionPlan {
  readonly planId: string;
  readonly farmId: string;
  readonly date: Date;
  readonly targetRole: Role;
  readonly actions: readonly ActionRecommendation[];
  readonly summary: string;
}
