// 팅커벨 AI 도구 감사 로그 페이지 (admin)

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';
import { Badge } from '@web/components/common/Badge';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';

interface AuditLogEntry {
  readonly logId: string;
  readonly requestId: string;
  readonly role: string;
  readonly toolName: string;
  readonly toolDomain: string;
  readonly inputSummary: string;
  readonly resultStatus: string;
  readonly executionMs: number;
  readonly approvalRequired: boolean;
  readonly startedAt: string;
}

interface DomainStat {
  readonly tool_domain: string;
  readonly cnt: number;
  readonly avg_ms: number;
}

interface AuditLogResponse {
  readonly logs: readonly AuditLogEntry[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly summary: {
    readonly days: number;
    readonly domainStats: readonly DomainStat[];
    readonly notice?: string;
  };
}

const ROLE_LABELS: Record<string, string> = {
  farmer: '농장주',
  veterinarian: '수의사',
  inseminator: '수정사',
  government_admin: '행정관',
  quarantine_officer: '방역관',
  feed_company: '사료회사',
  unknown: '미상',
};

const DOMAIN_LABELS: Record<string, string> = {
  sensor: '센서',
  repro: '번식',
  farm: '농장',
  public_data: '공공데이터',
  report: '보고서',
  action: '액션',
  unknown: '기타',
};

const STATUS_VARIANT: Record<string, 'success' | 'critical' | 'high' | 'info'> = {
  success: 'success',
  denied: 'critical',
  error: 'critical',
  pending_approval: 'high',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export default function AuditLogPage(): React.JSX.Element {
  const [days, setDays] = useState(7);
  const [filterTool, setFilterTool] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 30;

  const queryParams = new URLSearchParams({
    days: String(days),
    limit: String(pageSize),
    offset: String(page * pageSize),
  });
  if (filterTool) queryParams.set('toolName', filterTool);
  if (filterRole) queryParams.set('role', filterRole);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'audit-log', days, filterTool, filterRole, page],
    queryFn: () => apiGet<AuditLogResponse | null>(`/admin/audit-log?${queryParams.toString()}`),
    staleTime: 15 * 1000,
  });

  if (isLoading) return <LoadingSkeleton lines={8} />;

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const domainStats = data?.summary?.domainStats ?? [];
  const notice = data?.summary?.notice;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI 도구 감사 로그</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            팅커벨이 호출한 모든 도구의 이력을 조회합니다 ({total}건)
          </p>
        </div>
        <button
          onClick={() => { void refetch(); }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          새로고침
        </button>
      </div>

      {/* 알림 배너 */}
      {notice && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
          {notice}
        </div>
      )}

      {/* 도메인 요약 카드 */}
      {domainStats.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {domainStats.map((stat) => (
            <div key={stat.tool_domain} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {DOMAIN_LABELS[stat.tool_domain] ?? stat.tool_domain}
              </div>
              <div className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{stat.cnt}</div>
              <div className="text-xs text-gray-400">avg {stat.avg_ms}ms</div>
            </div>
          ))}
        </div>
      )}

      {/* 필터 */}
      <div className="flex flex-wrap gap-3">
        <select
          value={days}
          onChange={(e) => { setDays(Number(e.target.value)); setPage(0); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          aria-label="조회 기간"
        >
          <option value={1}>최근 1일</option>
          <option value={7}>최근 7일</option>
          <option value={30}>최근 30일</option>
          <option value={90}>최근 90일</option>
        </select>

        <select
          value={filterRole}
          onChange={(e) => { setFilterRole(e.target.value); setPage(0); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          aria-label="역할 필터"
        >
          <option value="">전체 역할</option>
          <option value="farmer">농장주</option>
          <option value="veterinarian">수의사</option>
          <option value="inseminator">수정사</option>
          <option value="government_admin">행정관</option>
          <option value="quarantine_officer">방역관</option>
          <option value="feed_company">사료회사</option>
        </select>

        <select
          value={filterTool}
          onChange={(e) => { setFilterTool(e.target.value); setPage(0); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          aria-label="도구 필터"
        >
          <option value="">전체 도구</option>
          <option value="query_animal">개체 조회</option>
          <option value="query_animal_events">이벤트 조회</option>
          <option value="query_farm_summary">농장 요약</option>
          <option value="query_breeding_stats">번식 통계</option>
          <option value="query_sensor_data">센서 데이터</option>
          <option value="query_traceability">이력제 조회</option>
          <option value="record_insemination">수정 기록</option>
          <option value="record_pregnancy_check">임신감정 기록</option>
          <option value="recommend_insemination_window">수정적기 추천</option>
          <option value="record_treatment">치료 기록</option>
          <option value="get_farm_kpis">농장 KPI</option>
        </select>
      </div>

      {/* 로그 테이블 */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">시각</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">역할</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">도구</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">도메인</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">상태</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">소요(ms)</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">입력 요약</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  {notice ? '마이그레이션 후 데이터가 쌓입니다.' : '해당 기간에 기록된 도구 호출이 없습니다.'}
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.logId} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                    {formatTime(log.startedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={ROLE_LABELS[log.role] ?? log.role} variant="info" />
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {log.toolName}
                    {log.approvalRequired && <span className="ml-1 text-xs text-orange-500" title="승인 필요">*</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {DOMAIN_LABELS[log.toolDomain] ?? log.toolDomain}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={log.resultStatus} variant={STATUS_VARIANT[log.resultStatus] ?? 'info'} />
                  </td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-gray-600 dark:text-gray-300">
                    {log.executionMs}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-gray-500 dark:text-gray-400" title={log.inputSummary}>
                    {log.inputSummary.length > 80 ? `${log.inputSummary.slice(0, 80)}...` : log.inputSummary}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} / {total}건
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-lg border border-gray-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-gray-600 dark:text-white"
            >
              이전
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg border border-gray-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-gray-600 dark:text-white"
            >
              다음
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
