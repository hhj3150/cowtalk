// 행동 일별 지표 카탈로그 + 순수 함수 (검증·CSV 열 매핑·7일 추세)
//
// 참고 범위는 일반 문헌 기준의 관리 지침이지 진단 기준이 아니다. 가장 중요한 비교 대상은
// 그 목장·그 그룹의 기존 데이터(기준선)다.

import type {
  BehaviorDailyInput,
  BehaviorDailyRecord,
  BehaviorGroupKey,
  BehaviorMetricDefinition,
  BehaviorMetricKey,
  BehaviorMetrics,
  BehaviorTrend,
} from '../types/behavior.js';
import type { DelimitedTable } from '../utils/milk-csv.js';

export const BEHAVIOR_METRIC_DEFS: readonly BehaviorMetricDefinition[] = [
  { key: 'lyingHours', labelKo: '횡와(휴식) 시간', unit: 'h', min: 0, max: 24,
    aliases: ['lyingtime', 'lying', 'lyingh', 'lyinghours', '횡와시간', '횡와', '휴식시간'] },
  { key: 'standingHours', labelKo: '기립 시간', unit: 'h', min: 0, max: 24,
    aliases: ['standingtime', 'standing', 'standingh', 'standinghours', '기립시간', '기립'] },
  { key: 'standingActiveHours', labelKo: '활동성 기립', unit: 'h', min: 0, max: 24,
    aliases: ['activestanding', 'standingactive', '활동성기립'] },
  { key: 'standingInactiveHours', labelKo: '비활동성 기립', unit: 'h', min: 0, max: 24,
    aliases: ['inactivestanding', 'standinginactive', '비활동성기립'] },
  { key: 'movingHours', labelKo: '이동 시간', unit: 'h', min: 0, max: 24,
    aliases: ['movingtime', 'moving', 'movingh', 'walking', '이동시간', '이동'] },
  { key: 'ruminationLyingMin', labelKo: '횡와 중 반추', unit: '분', min: 0, max: 1440,
    aliases: ['ruminationlyingmin', 'ruminationwhilelyingmin', '횡와중반추분', '누운반추분'] },
  { key: 'ruminationStandingMin', labelKo: '기립 중 반추', unit: '분', min: 0, max: 1440,
    aliases: ['ruminationstandingmin', 'ruminationwhilestandingmin', '기립중반추분', '선반추분'] },
  { key: 'ruminationLyingPct', labelKo: '횡와 중 반추 비율', unit: '%', min: 0, max: 100,
    aliases: ['ruminationwhilelying', 'ruminationlying', 'ruminationlyingpct', '횡와중반추', '횡와중반추비율'] },
  { key: 'ruminationStandingPct', labelKo: '기립 중 반추 비율', unit: '%', min: 0, max: 100,
    aliases: ['ruminationwhilestanding', 'ruminationstanding', 'ruminationstandingpct', '기립중반추', '기립중반추비율'] },
  { key: 'peakLyingSyncPct', labelKo: '최대 동시 횡와율', unit: '%', min: 0, max: 100,
    aliases: ['peaklyingsync', 'lyingsync', 'peaklyingsyncpct', '최대동시횡와율', '동시횡와율'] },
  { key: 'animalCount', labelKo: '집계 두수', unit: '두', min: 0, max: 100000,
    aliases: ['animalcount', 'animals', 'count', 'cows', '두수', '집계두수'] },
] as const;

export const BEHAVIOR_METRIC_MAP: Readonly<Record<BehaviorMetricKey, BehaviorMetricDefinition>> =
  Object.fromEntries(BEHAVIOR_METRIC_DEFS.map((d) => [d.key, d])) as Record<BehaviorMetricKey, BehaviorMetricDefinition>;

export const BEHAVIOR_GROUP_LABELS: Readonly<Record<BehaviorGroupKey, string>> = {
  all: '우군 전체',
  lactating: '착유우',
  fresh: '분만 후',
  close_up: '분만 전',
  dry: '건유우',
  heifer: '육성우',
  other: '기타',
};

/** 일반 문헌 기준 횡와시간 참고 범위 — 관리 지침이며 목장 기준선이 우선 */
export const LYING_TIME_REFERENCE = {
  housed: { min: 12, max: 14, labelKo: '축사 사육 권장 12~14시간' },
  pasture: { min: 9, max: 12, labelKo: '방목 9~12시간 (축사보다 짧은 것이 정상)' },
} as const;

/** 그룹 두수가 이보다 적으면 그룹 평균의 변동이 커 '참고'로만 표시 */
export const BEHAVIOR_SMALL_GROUP_THRESHOLD = 15;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GROUP_KEYS: ReadonlySet<string> = new Set(Object.keys(BEHAVIOR_GROUP_LABELS));
export const BEHAVIOR_MAX_ROWS = 400;

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** 파생값 보완 — 원값은 그대로 두고 빈 칸만 채운다 */
export function completeBehaviorMetrics(m: BehaviorMetrics): BehaviorMetrics {
  const out: Record<string, number | null | undefined> = { ...m };
  const a = m.standingActiveHours;
  const b = m.standingInactiveHours;
  if (out.standingHours == null && typeof a === 'number' && typeof b === 'number') out.standingHours = round1(a + b);
  const rl = m.ruminationLyingMin;
  const rs = m.ruminationStandingMin;
  if (typeof rl === 'number' && typeof rs === 'number' && rl + rs > 0) {
    if (out.ruminationLyingPct == null) out.ruminationLyingPct = Math.round((rl / (rl + rs)) * 100);
    if (out.ruminationStandingPct == null) out.ruminationStandingPct = Math.round((rs / (rl + rs)) * 100);
  }
  return out as BehaviorMetrics;
}

export type BehaviorValidation =
  | { readonly ok: true; readonly rows: readonly BehaviorDailyInput[] }
  | { readonly ok: false; readonly reason: string };

/** 저장 요청 검증 — 형식·범위·최소 1개 지표·행 수 상한 */
export function validateBehaviorRows(body: unknown): BehaviorValidation {
  if (!Array.isArray(body) || body.length === 0) return { ok: false, reason: 'rows 배열이 필요합니다' };
  if (body.length > BEHAVIOR_MAX_ROWS) return { ok: false, reason: `한 번에 최대 ${String(BEHAVIOR_MAX_ROWS)}행까지 저장할 수 있습니다` };

  const rows: BehaviorDailyInput[] = [];
  for (let i = 0; i < body.length; i++) {
    const r = body[i] as Record<string, unknown> | null;
    const at = `${String(i + 1)}행`;
    if (r == null || typeof r !== 'object') return { ok: false, reason: `${at}: 형식 오류` };
    const date = typeof r.date === 'string' ? r.date : '';
    if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) return { ok: false, reason: `${at}: date(YYYY-MM-DD)가 필요합니다` };
    const groupKey = typeof r.groupKey === 'string' ? r.groupKey : 'all';
    if (!GROUP_KEYS.has(groupKey)) return { ok: false, reason: `${at}: 알 수 없는 그룹 ${groupKey}` };
    const raw = (r.metrics ?? {}) as Record<string, unknown>;
    const metrics: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v == null || v === '') continue;
      const def = BEHAVIOR_METRIC_MAP[k as BehaviorMetricKey];
      if (!def) return { ok: false, reason: `${at}: 알 수 없는 지표 ${k}` };
      const n = Number(v);
      if (!Number.isFinite(n) || n < def.min || n > def.max) {
        return { ok: false, reason: `${at}: ${def.labelKo} 값은 ${String(def.min)}~${String(def.max)}${def.unit} 범위여야 합니다` };
      }
      metrics[k] = n;
    }
    if (Object.keys(metrics).filter((k) => k !== 'animalCount').length === 0) {
      return { ok: false, reason: `${at}: 행동 지표가 하나도 없습니다` };
    }
    const done = completeBehaviorMetrics(metrics);
    const hours = (done.lyingHours ?? 0) + (done.standingHours ?? 0) + (done.movingHours ?? 0);
    if (hours > 24.5) return { ok: false, reason: `${at}: 횡와+기립+이동 합계가 24시간을 넘습니다 (${String(round1(hours))}h)` };
    rows.push({ groupKey: groupKey as BehaviorGroupKey, date, metrics: done });
  }
  return { ok: true, rows };
}

// ── CSV 열 매핑 ──

const norm = (s: string): string => s.toLowerCase().replace(/[\s_\-()%[\]/.:]/g, '');
const DATE_ALIASES = ['date', 'day', '날짜', '일자', '일'];
const GROUP_ALIASES = ['group', 'groupname', '그룹', '우군', '군'];

/** 그룹 이름 → 그룹 키 (한·영 흔한 표기) */
export function normalizeBehaviorGroup(raw: string): BehaviorGroupKey {
  const s = norm(raw);
  if (!s || ['all', 'herd', 'total', '전체', '우군전체'].includes(s)) return 'all';
  if (s.includes('fresh') || s.includes('분만후') || s.includes('신선')) return 'fresh';
  if (s.includes('closeup') || s.includes('분만전') || s.includes('전환기')) return 'close_up';
  if (s.includes('dry') || s.includes('건유')) return 'dry';
  if (s.includes('heifer') || s.includes('육성') || s.includes('young')) return 'heifer';
  if (s.includes('lact') || s.includes('milking') || s.includes('착유')) return 'lactating';
  return 'other';
}

/** 날짜 표기 흡수: 2026-11-05, 2026.11.05, 2026/11/05, 05.11.2026, 11/05/2026(미국식은 지원 안 함) */
export function normalizeBehaviorDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return null;
}

export interface BehaviorCsvResult {
  readonly rows: readonly BehaviorDailyInput[];
  /** 인식한 열: 원래 헤더 → 지표 키 */
  readonly mapped: Readonly<Record<string, string>>;
  readonly unmatchedHeaders: readonly string[];
  readonly skipped: number;
}

/** 표 → 저장 행. 날짜 열은 필수, 그룹 열이 없으면 defaultGroup */
export function mapBehaviorCsv(table: DelimitedTable, defaultGroup: BehaviorGroupKey = 'all'): BehaviorCsvResult {
  const mapped: Record<string, string> = {};
  const unmatched: string[] = [];
  let dateIdx = -1;
  let groupIdx = -1;
  const metricIdx: Array<[number, BehaviorMetricKey]> = [];

  table.headers.forEach((h, i) => {
    const n = norm(h);
    if (dateIdx < 0 && DATE_ALIASES.includes(n)) { dateIdx = i; mapped[h] = 'date'; return; }
    if (groupIdx < 0 && GROUP_ALIASES.includes(n)) { groupIdx = i; mapped[h] = 'group'; return; }
    // 정확히 일치를 먼저 — 'lyingsync' 가 접두어 'lying' 으로 횡와시간에 잘못 붙지 않게
    const def = BEHAVIOR_METRIC_DEFS.find((d) => d.aliases.includes(n))
      ?? BEHAVIOR_METRIC_DEFS.find((d) => d.aliases.some((a) => n.startsWith(a) && n.length - a.length <= 3));
    if (def && !metricIdx.some(([, k]) => k === def.key)) { metricIdx.push([i, def.key]); mapped[h] = def.key; return; }
    unmatched.push(h);
  });

  const rows: BehaviorDailyInput[] = [];
  let skipped = 0;
  if (dateIdx < 0) return { rows, mapped, unmatchedHeaders: unmatched, skipped: table.dataRows.length };
  for (const r of table.dataRows) {
    const date = normalizeBehaviorDate(r[dateIdx] ?? '');
    if (!date) { skipped += 1; continue; }
    const metrics: Record<string, number> = {};
    for (const [i, key] of metricIdx) {
      const cell = (r[i] ?? '').replace(',', '.').replace('%', '').trim();
      if (cell === '') continue;
      const n = Number(cell);
      if (Number.isFinite(n)) metrics[key] = n;
    }
    if (Object.keys(metrics).length === 0) { skipped += 1; continue; }
    const groupKey = groupIdx >= 0 ? normalizeBehaviorGroup(r[groupIdx] ?? '') : defaultGroup;
    rows.push({ groupKey, date, metrics });
  }
  return { rows, mapped, unmatchedHeaders: unmatched, skipped };
}

/** 그룹·지표별 최신값 vs 직전 7일 평균 (최신일 제외) */
export function computeBehaviorTrend(
  records: readonly BehaviorDailyRecord[],
  groupKey: BehaviorGroupKey,
  metric: BehaviorMetricKey,
): BehaviorTrend {
  const series = records
    .filter((r) => r.groupKey === groupKey && typeof r.metrics[metric] === 'number')
    .map((r) => ({ date: r.date, v: r.metrics[metric] as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = series[series.length - 1];
  if (!last) return { groupKey, metric, latestDate: null, latest: null, prior7Avg: null, deltaVsPrior7: null, priorDays: 0 };
  const lastMs = Date.parse(last.date);
  const prior = series.filter((p) => {
    const d = (lastMs - Date.parse(p.date)) / 86_400_000;
    return d >= 1 && d <= 7;
  });
  const avg = prior.length > 0 ? round1(prior.reduce((s, p) => s + p.v, 0) / prior.length) : null;
  return {
    groupKey,
    metric,
    latestDate: last.date,
    latest: last.v,
    prior7Avg: avg,
    deltaVsPrior7: avg === null ? null : round1(last.v - avg),
    priorDays: prior.length,
  };
}
