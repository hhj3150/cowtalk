// 알림 카운트 단일 진실 공급원 (D3, BUG-007 Part 2)
// metrics-contract.md §10 (v0.4) / fertility-service·herd-service 패턴 일관성.
//
// 단방향 흐름 (D3):
//   [도메인 서비스: fever-detector / lameness / rumination-drop / 임상 등]
//     → smaXtec 이벤트 또는 alerts 테이블 publish
//     → alert-aggregator (이 모듈) collect + filter + group
//     → UI / route 호출
//
// UI/route는 도메인 서비스를 직접 호출하지 않는다. aggregator만 경유.
//
// 핵심 원칙:
// 1. 사용자에게 표시되는 알림 카운트는 반드시 이 모듈을 호출. 인라인 COUNT 금지.
// 2. ackedFilter 기본값 = false → **미확인 알림만 카운트** (878 vs 874 모순 해소).
// 3. window 기본값 = '24h'.
// 4. D5/D13 패턴: 실측 0건 → 'ok' + '0', 측정 불가(NaN/음수) → 'data_insufficient' + '—'.

import { getDb } from '../../config/database.js';
import { smaxtecEvents, farms } from '../../db/schema.js';
import { and, eq, count, gte, inArray } from 'drizzle-orm';
import { resolveFarmProvince, PROVINCE_CENTERS } from '../epidemiology/province-mapper.js';

// ─────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────

export type AlertWindow = '24h' | '7d' | '30d' | 'live';
export type AlertSeverity = 'all' | 'critical' | 'high' | 'medium' | 'low';
export type AlertStatus = 'ok' | 'data_insufficient';
export type AlertDomain = 'breeding' | 'health' | 'epidemic' | 'herd' | 'all';

export interface AlertOpts {
  /** 시간 윈도우. 기본 '24h'. */
  readonly window?: AlertWindow;
  /** 심각도 필터. 기본 'all'. */
  readonly severity?: AlertSeverity;
  /**
   * Acknowledged 필터.
   * - `false` (기본): 미확인 알림만 (`acknowledged=false`) — D3 표준.
   * - `true`: 모든 알림 (acked 포함).
   */
  readonly ackedFilter?: boolean;
  /** 도메인 필터. 기본 'all'. */
  readonly domainFilter?: AlertDomain;
  /** 농장 목록 (미지정 = 전체). */
  readonly farmIds?: readonly string[];
}

export interface AlertCountResult {
  /** 알림 건수 (실측). 측정 불가 시 0. */
  readonly count: number;
  /** UI 직접 표시용. 정상 시 "878", 측정 불가 시 "—" (D5). */
  readonly displayValue: string;
  /** D5/D13 상태. 0건도 'ok' (실측 0). NaN/음수만 'data_insufficient'. */
  readonly status: AlertStatus;
}

// ─────────────────────────────────────────────────────────
// Domain → eventType 매핑 (audit 기반, smaxtecEvents.eventType 매칭)
// ─────────────────────────────────────────────────────────

const DOMAIN_EVENT_TYPES: Record<Exclude<AlertDomain, 'all'>, readonly string[]> = {
  breeding: [
    'estrus', 'heat', 'estrus_dnb',
    'insemination', 'no_insemination',
    'pregnancy_check', 'calving_detection', 'calving_confirmation',
    'abort', 'dry_off',
  ],
  health: [
    'temperature_high', 'temperature_low', 'temperature_warning',
    'rumination_decrease', 'activity_decrease', 'activity_increase',
    'drinking_decrease',
    'health_warning', 'health_alert', 'health_general',
    'ph_low', 'clinical_condition',
  ],
  epidemic: [
    'health_103',  // 법정전염병 의심 (확장 가능)
  ],
  herd: [
    'mortality', 'death', 'culling', 'cull',
  ],
};

// ─────────────────────────────────────────────────────────
// Pure helpers (테스트 가능)
// ─────────────────────────────────────────────────────────

/** 윈도우 문자열 → cutoff Date. 'live' = null (시간 필터 없음). */
export function windowToCutoff(window: AlertWindow, now: Date = new Date()): Date | null {
  switch (window) {
    case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d':  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'live': return null;
  }
}

/** 도메인 → eventType 배열. 'all'은 null (필터 없음). */
export function resolveDomainEventTypes(domain: AlertDomain): readonly string[] | null {
  if (domain === 'all') return null;
  return DOMAIN_EVENT_TYPES[domain];
}

/** 카운트 → AlertCountResult (D5/D13 분리). */
export function buildAlertCountResult(rawCount: number): AlertCountResult {
  if (!Number.isFinite(rawCount) || rawCount < 0) {
    return { count: 0, displayValue: '—', status: 'data_insufficient' };
  }
  const safe = Math.floor(rawCount);
  return {
    count: safe,
    displayValue: safe.toLocaleString('ko-KR'),
    status: 'ok',
  };
}

/** computeAlertCount alias — pure 함수 패턴 일관성. */
export function computeAlertCount(rawCount: number): AlertCountResult {
  return buildAlertCountResult(rawCount);
}

/**
 * 농장 좌표 row 배열을 시도별 알림 카운트로 집계 (D14 패턴).
 * 9 시도 모두 결과에 포함 (0건도 'ok' "0"). 해외/미분류 좌표는 제외.
 */
export function aggregateAlertRowsByProvince(
  rows: ReadonlyArray<{ lat: number | null; lng: number | null; address?: string | null }>,
): Map<string, AlertCountResult> {
  const counts = new Map<string, number>();
  const provinces = Object.keys(PROVINCE_CENTERS);
  for (const p of provinces) counts.set(p, 0);

  for (const r of rows) {
    const province = resolveFarmProvince({ address: r.address, lat: r.lat, lng: r.lng });
    if (counts.has(province)) {
      counts.set(province, (counts.get(province) ?? 0) + 1);
    }
  }

  const result = new Map<string, AlertCountResult>();
  for (const [province, cnt] of counts) {
    result.set(province, buildAlertCountResult(cnt));
  }
  return result;
}

// ─────────────────────────────────────────────────────────
// DB queries (where conditions 빌더)
// ─────────────────────────────────────────────────────────

function buildWhereConditions(opts: AlertOpts) {
  const conditions = [];

  // window
  const cutoff = windowToCutoff(opts.window ?? '24h');
  if (cutoff !== null) {
    conditions.push(gte(smaxtecEvents.detectedAt, cutoff));
  }

  // severity
  if (opts.severity && opts.severity !== 'all') {
    conditions.push(eq(smaxtecEvents.severity, opts.severity));
  }

  // ackedFilter: false(기본) = 미확인만. true = 모두 (필터 없음).
  if (opts.ackedFilter !== true) {
    conditions.push(eq(smaxtecEvents.acknowledged, false));
  }

  // domainFilter
  const eventTypes = resolveDomainEventTypes(opts.domainFilter ?? 'all');
  if (eventTypes && eventTypes.length > 0) {
    conditions.push(inArray(smaxtecEvents.eventType, [...eventTypes]));
  }

  // farmIds
  if (opts.farmIds && opts.farmIds.length > 0) {
    conditions.push(inArray(smaxtecEvents.farmId, [...opts.farmIds]));
  }

  return conditions;
}

// ─────────────────────────────────────────────────────────
// Public DB wrappers
// ─────────────────────────────────────────────────────────

/**
 * D3 표준 알림 카운트.
 * 기본: window=24h, ackedFilter=false (미확인만), severity=all, domain=all.
 * 모든 user-visible KPI 위젯이 이 함수를 호출해야 함.
 */
export async function getActiveAlerts(opts: AlertOpts = {}): Promise<AlertCountResult> {
  const db = getDb();
  const conditions = buildWhereConditions(opts);
  const [row] = await db
    .select({ cnt: count() })
    .from(smaxtecEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return buildAlertCountResult(Number(row?.cnt ?? 0));
}

/**
 * 도메인별 알림 카운트 (breeding/health/epidemic/herd + all).
 * UI가 도메인 칩(card)을 렌더링할 때 사용.
 */
export async function aggregateAlertsByDomain(
  opts: AlertOpts = {},
): Promise<Record<AlertDomain, AlertCountResult>> {
  const domains: ReadonlyArray<AlertDomain> = ['breeding', 'health', 'epidemic', 'herd'];
  const entries = await Promise.all(
    domains.map(async (d): Promise<[AlertDomain, AlertCountResult]> => {
      const result = await getActiveAlerts({ ...opts, domainFilter: d });
      return [d, result];
    }),
  );
  const all = await getActiveAlerts({ ...opts, domainFilter: 'all' });
  const out: Partial<Record<AlertDomain, AlertCountResult>> = {};
  for (const [d, r] of entries) out[d] = r;
  out.all = all;
  return out as Record<AlertDomain, AlertCountResult>;
}

/**
 * 농장별 알림 카운트 (마커 표시·랭킹용).
 * 결과: Map<farmId, count> (number, AlertCountResult 아님 — 마커당 표시는 단순 숫자).
 *
 * 사용 예: `/regional/map` 마커 activeAlerts.
 */
export async function aggregateAlertsByFarm(
  opts: AlertOpts = {},
): Promise<ReadonlyMap<string, number>> {
  const db = getDb();
  const conditions = buildWhereConditions(opts);
  const rows = await db
    .select({ farmId: smaxtecEvents.farmId })
    .from(smaxtecEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const byFarm = new Map<string, number>();
  for (const r of rows) {
    if (r.farmId) byFarm.set(r.farmId, (byFarm.get(r.farmId) ?? 0) + 1);
  }
  return byFarm;
}

/**
 * 시도별 알림 카운트 (D14 패턴, 9 시도 항상 포함).
 * `national-situation` / 전국 방역 지도에서 사용.
 */
export async function aggregateAlertsByProvince(
  opts: AlertOpts = {},
): Promise<ReadonlyMap<string, AlertCountResult>> {
  const db = getDb();
  const conditions = buildWhereConditions(opts);

  // farms.lat/lng JOIN — province-mapper로 시도 판별
  const rows = await db
    .select({ lat: farms.lat, lng: farms.lng, address: farms.address })
    .from(smaxtecEvents)
    .innerJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return aggregateAlertRowsByProvince(rows);
}

// ─────────────────────────────────────────────────────────
// Widget presets (D3 일관성 강제)
// ─────────────────────────────────────────────────────────

/**
 * 위젯 ID → AlertOpts 매핑. 사용자 가시 위젯의 일관성 강제 목적.
 * 신규 위젯 추가 시 여기 등록 → 호출처는 widgetId만 명시.
 */
const WIDGET_PRESETS: Readonly<Record<string, AlertOpts>> = {
  // 메인 대시보드 KPI 카드 4개
  'main_24h_alerts':          { window: '24h', ackedFilter: false },
  'main_health_issues':       { window: '24h', ackedFilter: false, domainFilter: 'health' },
  'main_breeding_alerts':     { window: '24h', ackedFilter: false, domainFilter: 'breeding' },
  'main_epidemic_alerts':     { window: '24h', ackedFilter: false, domainFilter: 'epidemic' },

  // AI 일일 브리핑 — 메인 24h와 동일 정의 (878 vs 874 통일)
  'ai_briefing_24h':          { window: '24h', ackedFilter: false },

  // 지역/방역
  'regional_marker_24h':      { window: '24h', ackedFilter: false },
  'epidemiology_dashboard':   { window: '24h', ackedFilter: false },
  'epidemic_critical':        { window: '24h', ackedFilter: false, severity: 'critical' },
};

/**
 * 위젯 preset 기반 알림 카운트.
 * 신규 위젯은 WIDGET_PRESETS에 등록 후 widgetId로 호출 → 일관성 자동 강제.
 * 등록 안 된 widgetId는 기본 opts (24h, !acked, all).
 */
export async function getAlertCountForWidget(
  widgetId: string,
  override: AlertOpts = {},
): Promise<AlertCountResult> {
  const preset = WIDGET_PRESETS[widgetId] ?? {};
  return getActiveAlerts({ ...preset, ...override });
}

/** Widget preset 목록 (테스트·문서·외부 inspector용). */
export function listWidgetPresets(): ReadonlyArray<{ widgetId: string; opts: AlertOpts }> {
  return Object.entries(WIDGET_PRESETS).map(([widgetId, opts]) => ({ widgetId, opts }));
}
