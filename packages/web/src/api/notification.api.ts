// 알림 채널 설정 API (카카오/SMS/이메일/인앱)

import { apiGet, apiPost } from './client';

export type NotificationChannel = 'kakao' | 'sms' | 'email' | 'inapp';

export interface NotificationPreference {
  readonly channel: NotificationChannel;
  readonly enabled: boolean;
  readonly urgentOnly: boolean;
  readonly quietHoursStart: string | null;
  readonly quietHoursEnd: string | null;
}

export interface NotificationTemplate {
  readonly templateId: string;
  readonly channel: NotificationChannel;
  readonly name: string;
  readonly preview: string;
}

export function getPreferences(): Promise<readonly NotificationPreference[]> {
  return apiGet<readonly NotificationPreference[]>('/notifications/preferences');
}

export function updatePreferences(prefs: readonly NotificationPreference[]): Promise<void> {
  return apiPost('/notifications/preferences', { preferences: prefs });
}

export function getTemplates(): Promise<readonly NotificationTemplate[]> {
  return apiGet<readonly NotificationTemplate[]>('/notifications/templates');
}

export function sendTestNotification(channel: NotificationChannel): Promise<void> {
  return apiPost('/notifications/test', { channel });
}
