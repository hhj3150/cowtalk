// 시스템 상태 페이지 (admin)

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';
import { Badge } from '@web/components/common/Badge';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';

interface ServiceStatus {
  readonly name: string;
  readonly status: 'healthy' | 'degraded' | 'down';
  readonly lastCheck: string;
  readonly details: string | null;
}

interface SystemInfo {
  readonly services: readonly ServiceStatus[];
  readonly pipeline: {
    readonly lastIngestion: string | null;
    readonly errorsLast24h: number;
  };
  readonly ai: {
    readonly lastAnalysis: string | null;
    readonly avgProcessingMs: number;
    readonly claudeAvailable: boolean;
  };
}

export default function SystemStatusPage(): React.JSX.Element {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'system'],
    queryFn: () => apiGet<SystemInfo | null>('/admin/system'),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  if (isLoading) return <LoadingSkeleton lines={6} />;

  // 기본값
  const services: readonly ServiceStatus[] = data?.services ?? [
    { name: '서버', status: 'healthy', lastCheck: new Date().toISOString(), details: null },
    { name: '센서 커넥터', status: 'healthy', lastCheck: new Date().toISOString(), details: null },
    { name: 'PostgreSQL', status: 'healthy', lastCheck: new Date().toISOString(), details: null },
    { name: 'Redis', status: 'healthy', lastCheck: new Date().toISOString(), details: null },
    { name: 'Claude API', status: data?.ai?.claudeAvailable ? 'healthy' : 'degraded', lastCheck: new Date().toISOString(), details: null },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">시스템 상태</h1>
        <button type="button" onClick={() => { refetch(); }} className="rounded-md border px-4 py-1.5 text-sm hover:bg-gray-50">
          새로고침
        </button>
      </div>

      {/* 서비스 상태 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">서비스 상태</h2>
        <div className="space-y-2">
          {services.map((svc) => (
            <div key={svc.name} className="flex items-center justify-between rounded bg-gray-50 px-4 py-2">
              <span className="text-sm font-medium text-gray-700">{svc.name}</span>
              <Badge
                label={svc.status === 'healthy' ? '정상' : svc.status === 'degraded' ? '저하' : '중단'}
                variant={svc.status === 'healthy' ? 'success' : svc.status === 'degraded' ? 'medium' : 'critical'}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 파이프라인 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">파이프라인</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500">마지막 수집</p>
            <p className="font-medium">{data?.pipeline?.lastIngestion ?? '없음'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">24시간 내 에러</p>
            <p className="font-medium">{data?.pipeline?.errorsLast24h ?? 0}건</p>
          </div>
        </div>
      </div>

      {/* AI 엔진 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">AI 엔진</h2>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500">마지막 분석</p>
            <p className="font-medium">{data?.ai?.lastAnalysis ?? '없음'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">평균 처리 시간</p>
            <p className="font-medium">{data?.ai?.avgProcessingMs ?? 0}ms</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Claude API</p>
            <Badge
              label={data?.ai?.claudeAvailable ? '사용 가능' : '사용 불가'}
              variant={data?.ai?.claudeAvailable ? 'success' : 'medium'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
