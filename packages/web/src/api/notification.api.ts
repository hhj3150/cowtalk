// 알림 채널 설정 API (카카오/SMS/이메일/인앱)

import { apiGet, apiPost } from './client';

export type NotificationChannel = 'kakao' | 'sms' | 'email' | 'inapp' | 'push';

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

const ALL_CHANNELS: readonly NotificationChannel[] = ['kakao', 'sms', 'email', 'inapp', 'push'];

// 설정 행이 없을 때의 기본값 — 서버 게이트도 '설정 없음 = 허용'이므로 push는 기본 on
const DEFAULT_ENABLED: ReadonlySet<NotificationChannel> = new Set(['inapp', 'push']);

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
        enabled: found?.isEnabled ?? DEFAULT_ENABLED.has(ch),
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
    enabled: DEFAULT_ENABLED.has(ch),
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
