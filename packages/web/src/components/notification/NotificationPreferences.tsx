// 알림 채널 설정 — 카카오/SMS/이메일/인앱

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import * as notificationApi from '@web/api/notification.api';
import type { NotificationPreference, NotificationChannel } from '@web/api/notification.api';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';

const CHANNEL_LABELS: Record<NotificationChannel, { name: string; description: string }> = {
  kakao: { name: '카카오 알림톡', description: '아침 6시 오늘의 액션플랜 + 긴급 알림' },
  sms: { name: 'SMS', description: '긴급 알림만 (카카오 미사용 시)' },
  email: { name: '이메일', description: '일일 리포트 + 성적표' },
  inapp: { name: '인앱 알림', description: '실시간 알림' },
};

export function NotificationPreferences(): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: notificationApi.getPreferences,
    staleTime: 5 * 60 * 1000,
  });

  const [prefs, setPrefs] = useState<readonly NotificationPreference[]>([]);

  useEffect(() => {
    if (Array.isArray(data)) setPrefs(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (updated: readonly NotificationPreference[]) => notificationApi.updatePreferences(updated),
  });

  const testMutation = useMutation({
    mutationFn: (channel: NotificationChannel) => notificationApi.sendTestNotification(channel),
  });

  function updatePref(channel: NotificationChannel, field: keyof NotificationPreference, value: unknown): void {
    const updated = prefs.map((p) => p.channel === channel ? { ...p, [field]: value } : p);
    setPrefs(updated);
  }

  function handleSave(): void {
    saveMutation.mutate(prefs);
  }

  if (isLoading) return <LoadingSkeleton lines={4} />;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-gray-900">알림 설정</h3>

      <div className="space-y-3">
        {prefs.map((pref) => {
          const info = CHANNEL_LABELS[pref.channel];
          return (
            <div key={pref.channel} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{info.name}</p>
                  <p className="text-xs text-gray-400">{info.description}</p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={pref.enabled}
                    onChange={(e) => updatePref(pref.channel, 'enabled', e.target.checked)}
                    aria-label={`${info.name} 활성화`}
                    className="peer sr-only"
                  />
                  <div className="h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-blue-600 peer-checked:after:translate-x-full" />
                </label>
              </div>

              {pref.enabled && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500">긴급 알림만</label>
                    <select
                      value={pref.urgentOnly ? 'yes' : 'no'}
                      onChange={(e) => updatePref(pref.channel, 'urgentOnly', e.target.value === 'yes')}
                      className="w-full rounded border px-2 py-1 text-xs"
                    >
                      <option value="no">전체 알림</option>
                      <option value="yes">긴급만</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500">야간 무음</label>
                    <div className="flex gap-1">
                      <input
                        type="time"
                        value={pref.quietHoursStart ?? '22:00'}
                        onChange={(e) => updatePref(pref.channel, 'quietHoursStart', e.target.value)}
                        className="w-full rounded border px-1 py-1 text-xs"
                      />
                      <span className="text-xs text-gray-400">~</span>
                      <input
                        type="time"
                        value={pref.quietHoursEnd ?? '06:00'}
                        onChange={(e) => updatePref(pref.channel, 'quietHoursEnd', e.target.value)}
                        className="w-full rounded border px-1 py-1 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {pref.enabled && (
                <button
                  type="button"
                  onClick={() => testMutation.mutate(pref.channel)}
                  disabled={testMutation.isPending}
                  className="mt-2 rounded bg-gray-100 px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-200"
                >
                  테스트 발송
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saveMutation.isPending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saveMutation.isPending ? '저장 중...' : '설정 저장'}
      </button>
      {saveMutation.isSuccess && <p className="text-xs text-green-600">저장 완료</p>}
    </div>
  );
}
