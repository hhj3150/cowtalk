// 알림 에스컬레이션 페이지

import React from 'react';
import { EscalationDashboard } from '@web/components/escalation/EscalationDashboard';

export default function EscalationPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">알림 에스컬레이션</h1>
      <EscalationDashboard />
    </div>
  );
}
