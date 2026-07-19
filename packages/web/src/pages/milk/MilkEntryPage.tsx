// 유량 입력 — 파일럿 1단계 핵심 화면
//
// 경제 환산("미조치 시 일 손실 N원")은 실측 유량이 있어야만 계산된다.
// 이 화면이 그 원료를 넣는 곳: 날짜 하나 잡고 여러 마리를 표로 한 번에,
// 또는 착유기/검정 CSV를 올려서 일괄 기록한다.

import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { listAnimals } from '@web/api/animal.api';
import { apiPost } from '@web/api/client';
import { useEffectiveFarmId } from '@web/hooks/useEffectiveFarmId';
import { TitleAccentBar } from '@web/components/unified-dashboard/WidgetTitle';
import { parseMilkCsv, parseDelimited, detectMilkColumns, extractMilkRows } from '@cowtalk/shared';
import type { MilkCsvRow, DelimitedTable, MilkColumnMapping } from '@cowtalk/shared';

interface BulkResultRow {
  readonly success: boolean;
  readonly earTag?: string | null;
  readonly error?: string;
}

interface BulkResponse {
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly results: readonly BulkResultRow[];
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface RowDraft {
  readonly y?: string;
  readonly fat?: string;
  readonly protein?: string;
  readonly scc?: string;
}

function optNum(raw: string | undefined): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export default function MilkEntryPage(): React.JSX.Element {
  // 배정 농장 1개인 목장주는 자동 결정 — "농장을 선택하라" 빈 화면 방지
  const selectedFarmId = useEffectiveFarmId();
  const [date, setDate] = useState(todayStr());
  const [values, setValues] = useState<Record<string, RowDraft>>({});
  const [csvErrors, setCsvErrors] = useState<readonly string[]>([]);
  const [lastResult, setLastResult] = useState<BulkResponse | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: animalPage, isLoading } = useQuery({
    queryKey: ['milk-entry-animals', selectedFarmId],
    queryFn: () => listAnimals({ farmId: selectedFarmId ?? undefined, limit: 100, status: 'active' }),
  });

  const cows = useMemo(() => {
    const list = animalPage?.data ?? [];
    // 착유 대상 위주: 암소 우선 정렬 (귀번호 순)
    return [...list].sort((a, b) => (a.earTag ?? '').localeCompare(b.earTag ?? ''));
  }, [animalPage]);

  const setField = (earTag: string, field: keyof RowDraft, value: string): void => {
    setValues((v) => ({ ...v, [earTag]: { ...v[earTag], [field]: value } }));
  };

  const filledCount = cows.filter((c) => {
    const v = values[c.earTag]?.y;
    return v != null && v !== '' && Number.isFinite(Number(v));
  }).length;

  const mutation = useMutation({
    mutationFn: async () => {
      const records = cows
        .filter((c) => {
          const v = values[c.earTag]?.y;
          return v != null && v !== '' && Number.isFinite(Number(v));
        })
        .map((c) => {
          const d = values[c.earTag]!;
          return {
            earTag: c.earTag,
            farmId: c.farmId,
            yieldL: Number(d.y),
            date,
            fat: optNum(d.fat),
            protein: optNum(d.protein),
            scc: optNum(d.scc),
          };
        });
      // 서버 한도 200건 — 청크 분할
      let total = 0;
      let succeeded = 0;
      let failed = 0;
      let results: BulkResultRow[] = [];
      for (let i = 0; i < records.length; i += 200) {
        const chunk = records.slice(i, i + 200);
        const r = await apiPost<BulkResponse>('/milk/records/bulk', { records: chunk });
        results = [...results, ...r.results];
        total += r.total;
        succeeded += r.succeeded;
        failed += r.failed;
      }
      return { total, succeeded, failed, results } satisfies BulkResponse;
    },
    onSuccess: (r) => {
      setLastResult(r);
      if (r.failed === 0) setValues({});
    },
  });

  // 파싱된 기록을 입력 표에 반영 (표에 없는 귀번호는 오류로 안내)
  const applyRows = (rows: Map<string, MilkCsvRow>, baseErrors: readonly string[]): void => {
    const known = new Set(cows.map((c) => c.earTag));
    const unknown: string[] = [];
    const next: Record<string, RowDraft> = { ...values };
    for (const [earTag, row] of rows) {
      if (known.has(earTag)) {
        next[earTag] = {
          y: String(row.yieldL),
          fat: row.fat != null ? String(row.fat) : undefined,
          protein: row.protein != null ? String(row.protein) : undefined,
          scc: row.scc != null ? String(row.scc) : undefined,
        };
      } else unknown.push(earTag);
    }
    const errors = [...baseErrors];
    if (unknown.length > 0) {
      errors.push(`이 농장에 없는 귀번호 ${unknown.length}건: ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? '…' : ''}`);
    }
    setCsvErrors(errors);
    setValues(next);
  };

  // 열 수동 매핑 상태 (자동 인식 실패 시 — Lely T4C 등 임의 열 배치)
  const [mappingTable, setMappingTable] = useState<DelimitedTable | null>(null);
  const [mappingDraft, setMappingDraft] = useState<Record<string, string>>({});

  const handleCsv = (file: File): void => {
    void file.text().then((text) => {
      setMappingTable(null);
      // 1) 표준 형식 (귀번호,유량[,유성분]) 시도
      const simple = parseMilkCsv(text);
      if (simple.rows.size > 0) {
        applyRows(simple.rows, simple.errors);
        return;
      }
      // 2) 임의 열 배치 — 헤더 이름으로 자동 감지 (Lely T4C 내보내기 등)
      const table = parseDelimited(text);
      const detected = detectMilkColumns(table.headers);
      if (detected) {
        const r = extractMilkRows(table, detected);
        applyRows(r.rows, [
          `열 자동 인식: 귀번호=${table.headers[detected.earTag]}, 유량=${table.headers[detected.yieldL]}` +
            (detected.fat != null ? `, 유지방=${table.headers[detected.fat]}` : ''),
          ...r.errors,
        ]);
        return;
      }
      // 3) 자동 인식 실패 → 열 수동 매핑 UI
      if (table.dataRows.length > 0 && table.headers.length >= 2) {
        setMappingTable(table);
        setMappingDraft({});
        setCsvErrors(['열을 자동으로 인식하지 못했습니다 — 아래에서 귀번호·유량 열을 지정해주세요.']);
      } else {
        setCsvErrors(['파일에서 데이터를 읽지 못했습니다 — CSV(콤마/탭 구분) 형식인지 확인해주세요.']);
      }
    });
  };

  const applyManualMapping = (): void => {
    if (!mappingTable) return;
    const idx = (k: string): number | undefined => {
      const v = mappingDraft[k];
      return v != null && v !== '' ? Number(v) : undefined;
    };
    const earTag = idx('earTag');
    const yieldL = idx('yieldL');
    if (earTag == null || yieldL == null) return;
    const mapping: MilkColumnMapping = {
      earTag,
      yieldL,
      ...(idx('fat') != null ? { fat: idx('fat') } : {}),
      ...(idx('protein') != null ? { protein: idx('protein') } : {}),
      ...(idx('scc') != null ? { scc: idx('scc') } : {}),
    };
    const r = extractMilkRows(mappingTable, mapping);
    applyRows(r.rows, r.errors);
    setMappingTable(null);
  };

  if (!selectedFarmId) {
    return (
      <div className="p-6 text-center text-sm" style={{ color: 'var(--ct-text-muted)' }}>
        상단에서 농장을 먼저 선택해주세요.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold" style={{ color: 'var(--ct-text)' }}>
          <TitleAccentBar />
          🥛 유량 입력
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
          실측 유량이 있어야 개체별 경제 환산(미조치 시 손실액)이 계산됩니다. 같은 날짜에 다시 저장하면 갱신됩니다.
        </p>
      </div>

      {/* 날짜 + CSV */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ct-text)' }}>
          측정일
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
            style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
          />
        </label>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-md border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
        >
          📄 CSV 불러오기 (귀번호,유량[,유지방,유단백,체세포] — 검정성적 호환)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          aria-label="유량 CSV 파일"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleCsv(f);
            e.target.value = '';
          }}
        />
        <span className="text-xs" style={{ color: 'var(--ct-text-muted)' }}>
          입력 {filledCount}두 / 전체 {cows.length}두
        </span>
      </div>

      {csvErrors.length > 0 && (
        <div className="rounded border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
          {csvErrors.slice(0, 6).map((e, i) => <div key={i}>{e}</div>)}
          {csvErrors.length > 6 && <div>…외 {csvErrors.length - 6}건</div>}
        </div>
      )}

      {/* 열 수동 매핑 — Lely T4C 등 자동 인식 실패한 내보내기 파일 */}
      {mappingTable && (
        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--ct-border)', background: 'var(--ct-card)' }}>
          <div className="mb-2 text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>열 지정 (착유기 내보내기 파일)</div>
          <div className="flex flex-wrap gap-3">
            {([
              { key: 'earTag', label: '귀번호 열 *' },
              { key: 'yieldL', label: '유량 열 *' },
              { key: 'fat', label: '유지방 열' },
              { key: 'protein', label: '유단백 열' },
              { key: 'scc', label: '체세포 열' },
            ] as const).map((f) => (
              <label key={f.key} className="flex flex-col gap-1 text-xs" style={{ color: 'var(--ct-text-muted)' }}>
                {f.label}
                <select
                  value={mappingDraft[f.key] ?? ''}
                  onChange={(e) => setMappingDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  className="rounded border px-2 py-1 text-sm"
                  style={{ background: 'var(--ct-surface-2, rgba(255,255,255,0.03))', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
                >
                  <option value="">선택 안 함</option>
                  {mappingTable.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-1 text-xs" style={{ color: 'var(--ct-text-muted)' }}>
            미리보기: {mappingTable.dataRows[0]?.slice(0, 6).join(' | ')}
          </div>
          <button
            type="button"
            disabled={mappingDraft.earTag == null || mappingDraft.earTag === '' || mappingDraft.yieldL == null || mappingDraft.yieldL === ''}
            onClick={applyManualMapping}
            className="mt-2 rounded-md px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
            style={{ background: 'var(--ct-primary)' }}
          >
            이 열 배치로 불러오기
          </button>
        </div>
      )}

      {/* 입력 표 */}
      {isLoading ? (
        <div className="py-10 text-center text-sm" style={{ color: 'var(--ct-text-muted)' }}>개체 목록 로딩 중…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--ct-border)', background: 'var(--ct-card)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs" style={{ borderColor: 'var(--ct-border)', color: 'var(--ct-text-muted)' }}>
                <th className="px-3 py-2">귀번호</th>
                <th className="px-3 py-2">품종/산차</th>
                <th className="px-3 py-2">유량 (L)</th>
                <th className="px-3 py-2">유지방 (%)</th>
                <th className="px-3 py-2">유단백 (%)</th>
                <th className="px-3 py-2">체세포 (천/mL)</th>
              </tr>
            </thead>
            <tbody>
              {cows.map((c) => {
                const d = values[c.earTag] ?? {};
                const cell = (field: keyof RowDraft, label: string, max: number, step: number, width: string) => (
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={max}
                    step={step}
                    value={d[field] ?? ''}
                    placeholder="—"
                    aria-label={`${c.earTag} ${label}`}
                    onChange={(e) => setField(c.earTag, field, e.target.value)}
                    className={`${width} rounded border px-2 py-1 text-sm`}
                    style={{ background: 'var(--ct-surface-2, rgba(255,255,255,0.03))', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
                  />
                );
                return (
                  <tr key={c.animalId} className="border-b last:border-0" style={{ borderColor: 'var(--ct-border)' }}>
                    <td className="px-3 py-1.5 font-semibold" style={{ color: 'var(--ct-text)' }}>{c.earTag}</td>
                    <td className="px-3 py-1.5 text-xs" style={{ color: 'var(--ct-text-muted)' }}>
                      {c.breed} · {c.parity}산
                    </td>
                    <td className="px-3 py-1.5">{cell('y', '유량', 100, 0.1, 'w-20')}</td>
                    <td className="px-3 py-1.5">{cell('fat', '유지방', 10, 0.1, 'w-16')}</td>
                    <td className="px-3 py-1.5">{cell('protein', '유단백', 10, 0.1, 'w-16')}</td>
                    <td className="px-3 py-1.5">{cell('scc', '체세포', 10000, 1, 'w-20')}</td>
                  </tr>
                );
              })}
              {cows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-xs" style={{ color: 'var(--ct-text-muted)' }}>활성 개체가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 저장 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={filledCount === 0 || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="rounded-md px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
          style={{ background: 'var(--ct-primary)' }}
        >
          {mutation.isPending ? '저장 중…' : `${date} 유량 ${filledCount}두 저장`}
        </button>
        {mutation.isError && <span className="text-xs text-red-400">저장 실패 — 네트워크를 확인해주세요</span>}
        {lastResult && (
          <span className="text-xs" style={{ color: lastResult.failed > 0 ? '#fbbf24' : '#34d399' }}>
            저장 완료: 성공 {lastResult.succeeded}건{lastResult.failed > 0 ? ` · 실패 ${lastResult.failed}건 (${lastResult.results.filter((r) => !r.success).slice(0, 3).map((r) => r.earTag ?? '?').join(', ')}…)` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
