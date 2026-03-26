// 목장현황 관리 대시보드 — /farm-management

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DataTable, type Column } from '@web/components/data/DataTable';
import { Badge } from '@web/components/common/Badge';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { FarmFormPanel } from '@web/components/farm/FarmFormPanel';
import { FarmMiniMap } from '@web/components/farm/FarmMiniMap';
import {
  getFarmSummary,
  getFarmList,
  type FarmRecord,
  type FarmSummaryKpi,
} from '@web/api/farm-management.api';

// ── 상수 ──

type TabId = 'list' | 'map';

const STATUS_LABELS: Readonly<Record<string, string>> = {
  active: '활성',
  inactive: '비활성',
  quarantine: '격리',
  suspended: '중단',
};

const STATUS_BADGE: Readonly<Record<string, 'success' | 'medium' | 'critical' | 'high'>> = {
  active: 'success',
  inactive: 'medium',
  quarantine: 'critical',
  suspended: 'high',
};

// ── KPI 카드 (인라인, KpiCard 의존 제거 — 심플 버전) ──

function SummaryCard({
  label,
  value,
  unit,
  color,
}: {
  readonly label: string;
  readonly value: number;
  readonly unit?: string;
  readonly color: string;
}): React.JSX.Element {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: 'var(--ct-card)',
        border: '1px solid var(--ct-border)',
        borderLeft: `4px solid ${color}`,
      }}
    >
      <p className="text-xs mb-1" style={{ color: 'var(--ct-text-secondary)' }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color: 'var(--ct-text)' }}>
        {value.toLocaleString()}
        {unit && <span className="text-sm font-normal ml-1" style={{ color: 'var(--ct-text-secondary)' }}>{unit}</span>}
      </p>
    </div>
  );
}

// ── 테이블 컬럼 정의 ──

const farmColumns: readonly Column<Record<string, unknown>>[] = [
  { key: 'name', label: '목장명', sortable: true },
  {
    key: 'region',
    label: '지역',
    sortable: true,
    render: (row) => {
      const province = String(row.regionProvince ?? '');
      const district = String(row.regionDistrict ?? '');
      return province ? `${province} ${district}` : '-';
    },
  },
  {
    key: 'currentHeadCount',
    label: '두수',
    sortable: true,
    render: (row) => `${String(row.currentHeadCount ?? 0)}두`,
  },
  {
    key: 'status',
    label: '상태',
    sortable: true,
    render: (row) => {
      const s = String(row.status);
      return <Badge label={STATUS_LABELS[s] ?? s} variant={STATUS_BADGE[s] ?? 'medium'} />;
    },
  },
  { key: 'ownerName', label: '대표자', sortable: true },
  { key: 'phone', label: '연락처' },
  {
    key: 'actions',
    label: '',
    width: '40px',
    render: () => (
      <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }} title="수정">
        ✏️
      </span>
    ),
  },
];

// ── 필터 바 ──

function FilterBar({
  statusFilter,
  onStatusChange,
}: {
  readonly statusFilter: string;
  readonly onStatusChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value)}
        className="rounded-lg border px-3 py-2 text-sm"
        style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
        aria-label="상태 필터"
      >
        <option value="all">전체 상태</option>
        <option value="active">활성</option>
        <option value="inactive">비활성</option>
        <option value="quarantine">격리</option>
        <option value="suspended">중단</option>
      </select>
    </div>
  );
}

// ── 메인 페이지 ──

export default function FarmManagementPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('list');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editFarm, setEditFarm] = useState<FarmRecord | null>(null);

  // 데이터 로딩
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['farm-management', 'summary'],
    queryFn: getFarmSummary,
    staleTime: 60 * 1000,
  });

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['farm-management', 'list', statusFilter],
    queryFn: () => getFarmList(statusFilter !== 'all' ? { status: statusFilter } : undefined),
    staleTime: 60 * 1000,
  });

  const summary: FarmSummaryKpi = summaryData?.data ?? {
    totalFarms: 0,
    totalHeadCount: 0,
    activeFarms: 0,
    inactiveFarms: 0,
    tracedAnimalCount: 0,
    sensorAnimalCount: 0,
  };

  const farmList = useMemo(() => (listData?.data ?? []) as readonly FarmRecord[], [listData]);

  const handleRowClick = useCallback((row: Record<string, unknown>) => {
    navigate(`/farm/${String(row.farmId)}/groups`);
  }, [navigate]);

  const handleEditClick = useCallback((farm: FarmRecord) => {
    setEditFarm(farm);
    setShowForm(true);
  }, []);

  const handleFormSaved = useCallback(() => {
    setShowForm(false);
    setEditFarm(null);
  }, []);

  const handleFormClose = useCallback(() => {
    setShowForm(false);
    setEditFarm(null);
  }, []);

  const handleNewFarm = useCallback(() => {
    setEditFarm(null);
    setShowForm(true);
  }, []);

  // 테이블 데이터에 수정 클릭 핸들러 추가
  const tableData = useMemo(() =>
    farmList.map((f) => ({
      ...f,
      _onEdit: () => handleEditClick(f),
    })),
    [farmList, handleEditClick],
  );

  // 수정 아이콘 컬럼 — 클릭 이벤트 분리
  const columnsWithEdit = useMemo((): readonly Column<Record<string, unknown>>[] => {
    return farmColumns.map((col) => {
      if (col.key !== 'actions') return col;
      return {
        ...col,
        render: (row: Record<string, unknown>) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const onEdit = row._onEdit as (() => void) | undefined;
              onEdit?.();
            }}
            className="p-1 hover:opacity-70"
            aria-label="수정"
          >
            ✏️
          </button>
        ),
      };
    });
  }, []);

  if (summaryLoading && listLoading) return <LoadingSkeleton lines={8} />;

  return (
    <div className="space-y-6 pb-24">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>
          목장 관리
        </h1>
        <button
          type="button"
          onClick={handleNewFarm}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
        >
          + 목장 등록
        </button>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="전체 농장" value={summary.totalFarms} color="#3b82f6" />
        <SummaryCard label="총 두수" value={summary.totalHeadCount} unit="두" color="#10b981" />
        <SummaryCard label="활성 농장" value={summary.activeFarms} color="#22c55e" />
        <SummaryCard label="비활성 농장" value={summary.inactiveFarms} color="#6b7280" />
      </div>

      {/* 이력제/센서 연동 현황 (소형) */}
      <div className="flex gap-4 flex-wrap">
        <span className="text-xs px-3 py-1 rounded-full" style={{ background: 'var(--ct-card)', color: 'var(--ct-text-secondary)', border: '1px solid var(--ct-border)' }}>
          이력제 연동: {summary.tracedAnimalCount.toLocaleString()}두
        </span>
        <span className="text-xs px-3 py-1 rounded-full" style={{ background: 'var(--ct-card)', color: 'var(--ct-text-secondary)', border: '1px solid var(--ct-border)' }}>
          센서 연동: {summary.sensorAnimalCount.toLocaleString()}두
        </span>
      </div>

      {/* 폼 패널 */}
      {showForm && (
        <FarmFormPanel
          editFarm={editFarm}
          onClose={handleFormClose}
          onSaved={handleFormSaved}
        />
      )}

      {/* 탭 + 필터 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--ct-border)' }}>
          {(['list', 'map'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="px-4 py-2 text-sm font-medium transition-colors"
              style={{
                background: activeTab === tab ? '#10b981' : 'var(--ct-card)',
                color: activeTab === tab ? '#fff' : 'var(--ct-text-secondary)',
              }}
            >
              {tab === 'list' ? '목록' : '지도'}
            </button>
          ))}
        </div>

        <FilterBar statusFilter={statusFilter} onStatusChange={setStatusFilter} />
      </div>

      {/* 콘텐츠 */}
      {activeTab === 'list' ? (
        <DataTable
          columns={columnsWithEdit}
          data={tableData as unknown as readonly Record<string, unknown>[]}
          keyField="farmId"
          onRowClick={handleRowClick}
          pageSize={20}
          searchPlaceholder="목장명 검색..."
          searchField="name"
        />
      ) : (
        <FarmMiniMap
          farms={farmList}
          onFarmClick={(farmId) => navigate(`/farm/${farmId}/groups`)}
        />
      )}
    </div>
  );
}
