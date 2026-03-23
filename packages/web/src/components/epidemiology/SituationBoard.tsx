// 실시간 역학 현황판
// 미니 지도 (히트맵) + 활성 경보 목록 + TOP5 위험 농장

import React from 'react';
import { Link } from 'react-router-dom';
import { RiskLevelBadge } from './RiskLevelBadge';
import type { RiskLevel } from './RiskLevelBadge';

export interface ActiveAlert {
  readonly alertId: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly alertType: string;
  readonly priority: string;
  readonly title: string;
  readonly createdAt: string;
}

export interface RiskFarm {
  readonly farmId: string;
  readonly farmName: string;
  readonly feverCount: number;
  readonly feverRate: number;
  readonly clusterAlert: boolean;
  readonly legalSuspect: boolean;
  readonly riskScore: number;
  readonly lat: number;
  readonly lng: number;
}

interface Props {
  top5RiskFarms: readonly RiskFarm[];
  activeAlerts: readonly ActiveAlert[];
  isLoading?: boolean;
}

function priorityToRisk(priority: string): RiskLevel {
  if (priority === 'critical') return 'red';
  if (priority === 'high') return 'orange';
  if (priority === 'medium') return 'yellow';
  return 'green';
}

function riskScoreToLevel(score: number): RiskLevel {
  if (score >= 70) return 'red';
  if (score >= 50) return 'orange';
  if (score >= 30) return 'yellow';
  return 'green';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function SituationBoard({ top5RiskFarms, activeAlerts, isLoading }: Props): React.JSX.Element {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-64 rounded-xl animate-pulse" style={{ background: 'var(--ct-border)' }} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* TOP5 위험 농장 */}
      <div
        className="rounded-xl border p-4"
        style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
      >
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--ct-text)' }}>
          <span>🔥</span>
          <span>지금 가장 위험한 농장 TOP 5</span>
        </h3>

        {top5RiskFarms.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--ct-text-secondary)' }}>
            현재 위험 농장 없음
          </p>
        ) : (
          <div className="space-y-2">
            {top5RiskFarms.map((farm, idx) => (
              <Link
                key={farm.farmId}
                to={`/epidemiology/radius?farmId=${farm.farmId}`}
                className="flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-opacity-80"
                style={{ background: 'var(--ct-bg)' }}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: idx === 0 ? '#ef4444' : idx === 1 ? '#f97316' : '#eab308' }}
                >
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--ct-text)' }}>
                    {farm.farmName}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                    발열 {farm.feverCount}두
                    {farm.clusterAlert && ' · 집단 발열'}
                    {farm.legalSuspect && ' · 법정전염병 의심'}
                  </p>
                </div>
                <RiskLevelBadge level={riskScoreToLevel(farm.riskScore)} size="sm" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 활성 경보 목록 */}
      <div
        className="rounded-xl border p-4"
        style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
      >
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--ct-text)' }}>
          <span>🚨</span>
          <span>활성 경보</span>
          {activeAlerts.length > 0 && (
            <span
              className="ml-auto rounded-full px-2 py-0.5 text-xs font-bold text-white"
              style={{ background: 'var(--ct-danger, #ef4444)' }}
            >
              {activeAlerts.length}
            </span>
          )}
        </h3>

        {activeAlerts.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--ct-text-secondary)' }}>
            활성 경보 없음
          </p>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {activeAlerts.map((alert) => (
              <div
                key={alert.alertId}
                className="flex items-start gap-2.5 rounded-lg p-2.5"
                style={{ background: 'var(--ct-bg)' }}
              >
                <RiskLevelBadge level={priorityToRisk(alert.priority)} size="sm" showLabel={false} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--ct-text)' }}>
                    {alert.farmName}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--ct-text-secondary)' }}>
                    {alert.title}
                  </p>
                </div>
                <span className="text-xs shrink-0" style={{ color: 'var(--ct-text-secondary)' }}>
                  {timeAgo(alert.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
