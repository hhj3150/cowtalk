// 알림 + 알림 이력 + 알림 발송

import type { EngineType } from './prediction';

export type AlertType =
  | 'health_risk'
  | 'estrus_candidate'
  | 'feeding_metabolic_risk'
  | 'productivity_drop'
  | 'herd_anomaly'
  | 'regional_warning'
  | 'system';

export type AlertStatus =
  | 'new'
  | 'acknowledged'
  | 'in_progress'
  | 'resolved'
  | 'dismissed'
  | 'expired';

export type AlertPriority = 'critical' | 'high' | 'medium' | 'low';

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push';

export interface Alert {
  readonly alertId: string;
  readonly alertType: AlertType;
  readonly engineType: EngineType | null;
  readonly animalId: string | null;
  readonly farmId: string;
  readonly predictionId: string | null;
  readonly priority: AlertPriority;
  readonly status: AlertStatus;
  readonly title: string;
  readonly explanation: string;
  readonly recommendedAction: string;
  readonly dedupKey: string;          // 중복 방지 키
  readonly cooldownUntil: Date | null;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AlertHistory {
  readonly historyId: string;
  readonly alertId: string;
  readonly previousStatus: AlertStatus;
  readonly newStatus: AlertStatus;
  readonly changedBy: string | null;
  readonly changedAt: Date;
  readonly notes: string | null;
}

export interface NotificationLog {
  readonly notificationId: string;
  readonly alertId: string;
  readonly channel: NotificationChannel;
  readonly recipientId: string;
  readonly recipientAddress: string;    // email/phone
  readonly sentAt: Date;
  readonly success: boolean;
  readonly errorMessage: string | null;
}

export interface AlertFilter {
  readonly farmId?: string;
  readonly animalId?: string;
  readonly alertType?: AlertType;
  readonly priority?: AlertPriority;
  readonly status?: AlertStatus;
  readonly engineType?: EngineType;
  readonly dateRange?: { from: Date; to: Date };
}
