// 클러스터 상세 모달 — AI 해석 + 방역 권고 + 에스컬레이션

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getClusterDetail, getEpidemicWarnings, acknowledgeWarning } from '@web/api/epidemic.api';
import { SpreadTrendChart } from './SpreadTrendChart';

interface Props {
  readonly clusterId: string;
  readonly onClose: () => void;
}

export function ClusterDetailModal({ clusterId, onClose }: Props): React.JSX.Element {
  const { data: cluster } = useQuery({
    queryKey: ['epidemic-cluster', clusterId],
    queryFn: () => getClusterDetail(clusterId),
  });

  const { data: warnings, refetch: refetchWarnings } = useQuery({
    queryKey: ['epidemic-warnings'],
    queryFn: getEpidemicWarnings,
  });

  const clusterWarnings = (warnings ?? []).filter((w) => w.clusterId === clusterId);

  const handleAcknowledge = async (warningId: string) => {
    try {
      await acknowledgeWarning(warningId);
      await refetchWarnings();
    } catch {
      // 에러 처리는 UI 레벨에서
    }
  };

  if (!cluster) {
    return (
      <ModalOverlay onClose={onClose}>
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ct-text-muted)' }}>
          로딩 중...
        </div>
      </ModalOverlay>
    );
  }

  const levelColors: Record<string, string> = {
    outbreak: '#ef4444',
    warning: '#f97316',
    watch: '#eab308',
  };
  const color = levelColors[cluster.level] ?? '#6b7280';

  // AI 해석 파싱
  const interpretation = clusterWarnings[0]?.aiInterpretation as {
    riskAssessment?: string;
    diseaseIdentification?: { likelyDisease?: string; confidence?: number; basis?: string[] };
    quarantineActions?: Array<{ actionType?: string; description?: string; urgency?: string }>;
    roleActions?: Record<string, string>;
  } | null;

  return (
    <ModalOverlay onClose={onClose}>
      {/* 헤더 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--ct-border)',
          paddingBottom: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
              {cluster.diseaseType} 클러스터
            </h2>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color,
                textTransform: 'uppercase',
                padding: '2px 8px',
                border: `1px solid ${color}`,
                borderRadius: 4,
              }}
            >
              {cluster.level}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ct-text-muted)', marginTop: 4 }}>
            {cluster.farmCount}개 농장 · {cluster.eventCount}건 이벤트 · 반경 {cluster.radiusKm.toFixed(1)}km
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--ct-text-muted)', fontSize: 20, cursor: 'pointer' }}
        >
          ×
        </button>
      </div>

      {/* AI 위험 평가 */}
      {interpretation?.riskAssessment && (
        <Section title="AI 위험 평가">
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>{interpretation.riskAssessment}</p>
          {interpretation.diseaseIdentification && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ct-text-secondary)' }}>
              추정 질병: <strong>{interpretation.diseaseIdentification.likelyDisease}</strong>
              {' '}(신뢰도 {Math.round((interpretation.diseaseIdentification.confidence ?? 0) * 100)}%)
            </div>
          )}
        </Section>
      )}

      {/* 방역 권고 */}
      {interpretation?.quarantineActions && interpretation.quarantineActions.length > 0 && (
        <Section title="방역 조치 권고">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {interpretation.quarantineActions.map((action, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  background: 'var(--ct-card-hover)',
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                <ActionBadge type={action.actionType ?? 'monitor'} />
                <span style={{ flex: 1 }}>{action.description}</span>
                {action.urgency && (
                  <span style={{ fontSize: 10, color: color, fontWeight: 600 }}>
                    {action.urgency}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 역할별 행동 지침 */}
      {interpretation?.roleActions && (
        <Section title="역할별 행동 지침">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {Object.entries(interpretation.roleActions).map(([role, action]) => (
              <div
                key={role}
                style={{
                  padding: '8px 10px',
                  background: 'var(--ct-card-hover)',
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--ct-text-secondary)', marginBottom: 4 }}>
                  {ROLE_LABELS[role] ?? role}
                </div>
                <div style={{ color: 'var(--ct-text)' }}>{action}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 확산 추이 차트 */}
      <Section title="확산 추이">
        <SpreadTrendChart clusterId={clusterId} />
      </Section>

      {/* 영향 농장 목록 */}
      <Section title={`영향 농장 (${cluster.farms?.length ?? 0}개)`}>
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          {(cluster.farms ?? []).map((farm) => (
            <div
              key={farm.farmId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderBottom: '1px solid var(--ct-border)',
                fontSize: 12,
              }}
            >
              <span>{farm.farmName}</span>
              <span style={{ color: 'var(--ct-text-muted)' }}>
                이벤트 {farm.eventCount}건
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* 경보 확인 버튼 */}
      {clusterWarnings.filter((w) => w.status === 'active').length > 0 && (
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          {clusterWarnings
            .filter((w) => w.status === 'active')
            .map((w) => (
              <button
                key={w.warningId}
                onClick={() => handleAcknowledge(w.warningId)}
                style={{
                  background: color,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                경보 확인 (Acknowledge)
              </button>
            ))}
        </div>
      )}
    </ModalOverlay>
  );
}

// ======================================================================
// 서브 컴포넌트
// ======================================================================

const ROLE_LABELS: Record<string, string> = {
  farmer: '농장주',
  veterinarian: '수의사',
  quarantine_officer: '방역관',
  government_admin: '행정관',
  inseminator: '수정사',
  feed_company: '사료회사',
};

function ModalOverlay({
  onClose,
  children,
}: {
  readonly onClose: () => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--ct-card)',
          borderRadius: 12,
          padding: 24,
          width: '90%',
          maxWidth: 700,
          maxHeight: '85vh',
          overflowY: 'auto',
          color: 'var(--ct-text)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text-secondary)', marginBottom: 8 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function ActionBadge({ type }: { readonly type: string }): React.JSX.Element {
  const labels: Record<string, { text: string; color: string }> = {
    isolate: { text: '격리', color: '#ef4444' },
    vaccinate: { text: '백신', color: '#3b82f6' },
    monitor: { text: '모니터링', color: '#eab308' },
    restrict_movement: { text: '이동제한', color: '#f97316' },
    test: { text: '검사', color: '#8b5cf6' },
    cull: { text: '살처분', color: '#dc2626' },
  };

  const config = labels[type] ?? { text: type, color: '#6b7280' };

  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: config.color,
        background: `${config.color}15`,
        padding: '2px 6px',
        borderRadius: 3,
      }}
    >
      {config.text}
    </span>
  );
}
