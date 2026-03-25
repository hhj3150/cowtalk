// 방역 검사 결과 (브루셀라·결핵) — 공공데이터 표시

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAnimalVaccineHistory } from '@web/api/vaccine.api';
import type { PublicInspection } from '@web/api/vaccine.api';
import { Badge } from '@web/components/common/Badge';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { EmptyState } from '@web/components/common/EmptyState';

interface Props {
  readonly animalId: string;
}

export function InspectionResults({ animalId }: Props): React.JSX.Element {
  const { data, isLoading, error } = useQuery({
    queryKey: ['animal', 'vaccine-history', animalId],
    queryFn: () => getAnimalVaccineHistory(animalId),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(animalId),
  });

  if (isLoading) return <LoadingSkeleton lines={3} />;
  if (error) return <EmptyState message="방역검사 결과를 불러올 수 없습니다." />;

  const inspections = data?.publicData.inspections ?? [];

  if (inspections.length === 0) {
    return (
      <EmptyState message="방역검사 이력이 없습니다. 이력제 번호가 등록되면 자동으로 조회됩니다." />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-purple-50 px-4 py-2 text-xs text-purple-700">
        출처: 축산물이력추적시스템 (data.go.kr) · 이력번호: <span className="font-mono font-semibold">{data?.traceId ?? '-'}</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-2 text-left font-medium text-gray-600">검사종류</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">검사일</th>
              <th className="px-4 py-2 text-center font-medium text-gray-600">결과</th>
            </tr>
          </thead>
          <tbody>
            {inspections.map((insp, idx) => (
              <React.Fragment key={`insp-${String(idx)}`}>
                {/* 브루셀라 */}
                {insp.inspectDate && (
                  <InspectionRow
                    testName="브루셀라"
                    date={insp.inspectDate}
                    result={insp.result}
                  />
                )}
                {/* 결핵 */}
                {insp.tbcInspectDate && (
                  <InspectionRow
                    testName="결핵"
                    date={insp.tbcInspectDate}
                    result={insp.tbcResult}
                  />
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* 요약 */}
      <InspectionSummary inspections={inspections} />
    </div>
  );
}

// ===========================
// 하위 컴포넌트
// ===========================

function InspectionRow({
  testName,
  date,
  result,
}: {
  readonly testName: string;
  readonly date: string;
  readonly result: string;
}): React.JSX.Element {
  const normalized = normalizeResult(result);
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-4 py-2 font-medium text-gray-800">{testName}</td>
      <td className="px-4 py-2 text-gray-600">{formatDate(date)}</td>
      <td className="px-4 py-2 text-center">
        <Badge
          label={normalized.label}
          variant={normalized.variant}
        />
      </td>
    </tr>
  );
}

function InspectionSummary({ inspections }: { readonly inspections: readonly PublicInspection[] }): React.JSX.Element {
  const allNegative = inspections.every((i) => {
    const brucNeg = !i.inspectDate || isNegative(i.result);
    const tbcNeg = !i.tbcInspectDate || isNegative(i.tbcResult);
    return brucNeg && tbcNeg;
  });

  return (
    <div className={`rounded-lg p-3 text-xs ${allNegative ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
      {allNegative ? (
        <p>✅ 모든 방역검사 결과 <span className="font-semibold">음성</span>입니다. 정상 상태입니다.</p>
      ) : (
        <p>⚠️ 양성 또는 미확인 결과가 있습니다. 수의사 확인이 필요합니다.</p>
      )}
    </div>
  );
}

// ===========================
// 유틸
// ===========================

function normalizeResult(raw: string): { label: string; variant: 'success' | 'critical' | 'medium' | 'info' } {
  const lower = raw.toLowerCase().trim();
  if (lower === '음성' || lower === 'negative' || lower === 'n') {
    return { label: '음성', variant: 'success' };
  }
  if (lower === '양성' || lower === 'positive' || lower === 'p') {
    return { label: '양성', variant: 'critical' };
  }
  if (lower === '검사중' || lower === 'pending') {
    return { label: '검사중', variant: 'medium' };
  }
  return { label: raw || '미확인', variant: 'info' };
}

function isNegative(result: string): boolean {
  const lower = result.toLowerCase().trim();
  return lower === '음성' || lower === 'negative' || lower === 'n';
}

function formatDate(raw: string | null | undefined): string {
  if (!raw) return '-';
  const d = raw.replace(/\D/g, '');
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return raw.slice(0, 10);
}
