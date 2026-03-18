// 알림 설정 페이지

import React from 'react';
import { NotificationPreferences } from '@web/components/notification/NotificationPreferences';

export default function NotificationSettingsPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">알림 설정</h1>
      <NotificationPreferences />
    </div>
  );
}
