// 데이터 테이블 — 정렬/필터/페이지네이션/행 클릭 드릴다운

import React, { useState, useMemo } from 'react';
import { EmptyState } from '@web/components/common/EmptyState';

export interface Column<T> {
  readonly key: string;
  readonly label: string;
  readonly render?: (row: T) => React.ReactNode;
  readonly sortable?: boolean;
  readonly width?: string;
}

interface Props<T> {
  readonly columns: readonly Column<T>[];
  readonly data: readonly T[];
  readonly keyField: string;
  readonly onRowClick?: (row: T) => void;
  readonly pageSize?: number;
  readonly searchPlaceholder?: string;
  readonly searchField?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyField,
  onRowClick,
  pageSize = 10,
  searchPlaceholder = '검색...',
  searchField,
}: Props<T>): React.JSX.Element {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search || !searchField) return data;
    const lower = search.toLowerCase();
    return data.filter((row) => {
      const val = row[searchField];
      return typeof val === 'string' && val.toLowerCase().includes(lower);
    });
  }, [data, search, searchField]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageData = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function handleSort(key: string): void {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  if (data.length === 0) {
    return <EmptyState message="표시할 데이터가 없습니다." />;
  }

  return (
    <div>
      {/* 검색 */}
      {searchField && (
        <div className="mb-3">
          <label htmlFor="datatable-search" className="sr-only">{searchPlaceholder}</label>
          <input
            id="datatable-search"
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder={searchPlaceholder}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-64"
          />
        </div>
      )}

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 ${col.sortable ? 'cursor-pointer select-none hover:text-gray-700' : ''}`}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  onKeyDown={col.sortable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort(col.key); } } : undefined}
                  tabIndex={col.sortable ? 0 : undefined}
                  role={col.sortable ? 'button' : undefined}
                  aria-sort={col.sortable && sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      <span>{sortDir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {pageData.map((row) => (
              <tr
                key={String(row[keyField])}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? 'cursor-pointer hover:bg-blue-50' : ''}
              >
                {columns.map((col) => (
                  <td key={col.key} className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                    {col.render ? col.render(row) : String(row[col.key] ?? '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
          <span>{sorted.length}건 중 {page * pageSize + 1}-{Math.min((page + 1) * pageSize, sorted.length)}건</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-40"
            >
              이전
            </button>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
              className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-40"
            >
              다음
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
