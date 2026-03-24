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

interface PreferencesResponse {
  readonly userId: string;
  readonly channels: readonly {
    readonly channel: string;
    readonly isEnabled: boolean;
    readonly alertTypes: readonly string[];
    readonly minSeverity: string;
    readonly quietHoursStart: string | null;
    readonly quietHoursEnd: string | null;
  }[];
}

const ALL_CHANNELS: readonly NotificationChannel[] = ['kakao', 'sms', 'email', 'inapp'];

export async function getPreferences(): Promise<readonly NotificationPreference[]> {
  const raw = await apiGet<PreferencesResponse | readonly NotificationPreference[]>('/notifications/preferences');

  // 서버가 { userId, channels } 형태로 반환하는 경우 매핑
  if (!Array.isArray(raw) && typeof raw === 'object' && 'channels' in raw) {
    const channelMap = new Map(
      raw.channels.map((ch) => [ch.channel, ch]),
    );
    return ALL_CHANNELS.map((ch) => {
      const found = channelMap.get(ch);
      return {
        channel: ch,
        enabled: found?.isEnabled ?? false,
        urgentOnly: found?.minSeverity === 'critical',
        quietHoursStart: found?.quietHoursStart ?? null,
        quietHoursEnd: found?.quietHoursEnd ?? null,
      };
    });
  }

  // 이미 배열이면 직접 반환
  if (Array.isArray(raw)) return raw;

  // 데이터 없을 때 기본값
  return ALL_CHANNELS.map((ch) => ({
    channel: ch,
    enabled: ch === 'inapp',
    urgentOnly: false,
    quietHoursStart: null,
    quietHoursEnd: null,
  }));
}

export function updatePreferences(prefs: readonly NotificationPreference[]): Promise<void> {
  const channels = prefs.map((p) => ({
    channel: p.channel,
    isEnabled: p.enabled,
    alertTypes: p.urgentOnly ? ['critical'] : ['critical', 'high', 'medium', 'low'],
    minSeverity: p.urgentOnly ? 'critical' : 'low',
    quietHoursStart: p.quietHoursStart,
    quietHoursEnd: p.quietHoursEnd,
  }));
  return apiPost('/notifications/preferences', { channels });
}

export function getTemplates(): Promise<readonly NotificationTemplate[]> {
  return apiGet<readonly NotificationTemplate[]>('/notifications/templates');
}

export function sendTestNotification(channel: NotificationChannel): Promise<void> {
  return apiPost('/notifications/test', { channel });
}
