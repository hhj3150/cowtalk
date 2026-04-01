// 알림 설정 페이지

import React from 'react';
import { NotificationPreferences } from '@web/components/notification/NotificationPreferences';
import { KakaoAlimtalkSettings } from '@web/components/notification/KakaoAlimtalkSettings';

export default function NotificationSettingsPage(): React.JSX.Element {
  return (
    <div className="space-y-6 pb-8">
      <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>알림 설정</h1>

      {/* 카카오 알림톡 — 가장 중요한 채널, 상단 배치 */}
      <KakaoAlimtalkSettings />

      {/* 기타 채널 설정 */}
      <NotificationPreferences />
    </div>
  );
}
