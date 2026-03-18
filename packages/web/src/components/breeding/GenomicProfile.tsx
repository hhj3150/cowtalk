// 유전체 정보 표시

import React from 'react';

interface GenomicData {
  readonly milkYieldGebv: number | null;
  readonly fatGebv: number | null;
  readonly proteinGebv: number | null;
  readonly sccGebv: number | null;
  readonly a2Status: string | null;
  readonly snpMarkers: readonly { name: string; value: string }[];
}

interface Props {
  readonly data: GenomicData | null;
}

export function GenomicProfile({ data }: Props): React.JSX.Element {
  if (!data) {
    return <div className="text-xs text-gray-400">유전체 분석 데이터가 없습니다.</div>;
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-gray-900">유전체 프로필</h4>

      {/* gEBV */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: '유량 gEBV', value: data.milkYieldGebv, unit: 'kg' },
          { label: '유지방 gEBV', value: data.fatGebv, unit: '%' },
          { label: '유단백 gEBV', value: data.proteinGebv, unit: '%' },
          { label: 'SCC gEBV', value: data.sccGebv, unit: '' },
        ].map((item) => (
          <div key={item.label} className="rounded border border-gray-200 bg-gray-50 p-2 text-center">
            <p className="text-[10px] text-gray-500">{item.label}</p>
            <p className="text-sm font-bold text-gray-900">
              {item.value !== null ? `${item.value > 0 ? '+' : ''}${item.value}${item.unit}` : '-'}
            </p>
          </div>
        ))}
      </div>

      {/* A2 유전자형 */}
      {data.a2Status && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">베타카제인:</span>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${
            data.a2Status === 'A2A2'
              ? 'bg-green-100 text-green-800'
              : data.a2Status === 'A1A2'
              ? 'bg-yellow-100 text-yellow-800'
              : 'bg-red-100 text-red-800'
          }`}>
            {data.a2Status}
          </span>
        </div>
      )}

      {/* SNP 마커 */}
      {data.snpMarkers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.snpMarkers.map((marker) => (
            <span key={marker.name} className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
              {marker.name}: {marker.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
