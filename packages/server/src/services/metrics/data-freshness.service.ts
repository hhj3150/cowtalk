// 데이터 신선도 — "지금 화면의 데이터가 얼마나 실시간인가"를 소스별로 판정.
// 전체목장 통합 플랫폼의 신뢰 기반: 오래된 데이터를 실시간인 척 보여주지 않는다.

import { getDb } from '../../config/database.js';
import { sql } from 'drizzle-orm';
import { getPipelineOrchestrator } from '../../pipeline/orchestrator.js';
import { logger } from '../../lib/logger.js';

export type FreshnessStatus = 'live' | 'delayed' | 'stale' | 'none';

export interface SourceFreshness {
  readonly source: string;
  readonly label: string;
  readonly lastRecordAt: string | null;
  readonly ageMinutes: number | null;
  readonly status: FreshnessStatus;
}

export interface DataFreshnessReport {
  readonly checkedAt: string;
  readonly pipelineRunning: boolean;
  readonly lastRealtimeCycleAt: string | null;
  readonly overall: FreshnessStatus;
  readonly sources: readonly SourceFreshness[];
}

// 소스별 신선도 기준 (분) — 수집 주기에 맞춘 현실적 임계값
// smaXtec 이벤트: 5분 주기 수집이지만 이벤트 자체가 뜸해서 24h까지 live로 본다.
// 센서 수치: 5분 주기 30마리 배치 순환 — 최근 수집분 기준 60분 내면 live.
const THRESHOLDS: ReadonlyArray<{
  source: string;
  label: string;
  query: string;
  liveMin: number;
  delayedMin: number;
}> = [
  {
    source: 'smaxtec_sensors',
    label: 'smaXtec 센서 수치 (체온·활동량)',
    // metric_type='temp'로 한정 — (metric_type, timestamp DESC) 인덱스로 즉시 조회 (전체 MAX는 풀스캔)
    query: "SELECT MAX(timestamp) AS ts FROM sensor_measurements WHERE metric_type = 'temp'",
    liveMin: 60,
    delayedMin: 6 * 60,
  },
  {
    source: 'smaxtec_events',
    label: 'smaXtec 이벤트 (발정·건강 알람)',
    query: 'SELECT MAX(created_at) AS ts FROM smaxtec_events',
    liveMin: 24 * 60,
    delayedMin: 3 * 24 * 60,
  },
  {
    source: 'animal_master',
    label: '개체 마스터 (smaXtec 동기화)',
    query: 'SELECT MAX(updated_at) AS ts FROM animals',
    liveMin: 24 * 60,
    delayedMin: 7 * 24 * 60,
  },
  {
    source: 'weather',
    label: '기상 데이터',
    query: "SELECT MAX(started_at) AS ts FROM ingestion_runs ir JOIN data_sources ds ON ir.source_id = ds.source_id WHERE ds.source_type = 'weather' AND ir.status = 'completed'",
    liveMin: 6 * 60,
    delayedMin: 48 * 60,
  },
  {
    source: 'public_data',
    label: '공공데이터 배치 (이력제·등급 등)',
    query: "SELECT MAX(started_at) AS ts FROM ingestion_runs ir JOIN data_sources ds ON ir.source_id = ds.source_id WHERE ds.source_type <> 'weather' AND ir.status = 'completed'",
    liveMin: 26 * 60, // 24h 배치 + 여유
    delayedMin: 3 * 24 * 60,
  },
];

function judge(ageMinutes: number | null, liveMin: number, delayedMin: number): FreshnessStatus {
  if (ageMinutes === null) return 'none';
  if (ageMinutes <= liveMin) return 'live';
  if (ageMinutes <= delayedMin) return 'delayed';
  return 'stale';
}

// 60초 캐시 — 대시보드·팅커벨이 동시에 조회해도 DB 부하 없음
let cached: { report: DataFreshnessReport; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60 * 1000;

export async function getDataFreshness(): Promise<DataFreshnessReport> {
  if (cached && Date.now() < cached.expiresAt) return cached.report;
  const db = getDb();

  const sources: SourceFreshness[] = [];
  for (const t of THRESHOLDS) {
    let lastRecordAt: string | null = null;
    let ageMinutes: number | null = null;
    try {
      const rows = await db.execute(sql.raw(t.query));
      const ts = (rows[0] as { ts: string | Date | null } | undefined)?.ts ?? null;
      if (ts) {
        const d = ts instanceof Date ? ts : new Date(ts);
        lastRecordAt = d.toISOString();
        ageMinutes = Math.round((Date.now() - d.getTime()) / 60_000);
      }
    } catch (err) {
      logger.warn({ err, source: t.source }, '[Freshness] 소스 조회 실패');
    }
    sources.push({
      source: t.source,
      label: t.label,
      lastRecordAt,
      ageMinutes,
      status: judge(ageMinutes, t.liveMin, t.delayedMin),
    });
  }

  // 파이프라인 실행 상태 (커넥터 healthCheck 없이 상태만 — 경량)
  let pipelineRunning = false;
  let lastRealtimeCycleAt: string | null = null;
  try {
    const health = await getPipelineOrchestrator().getHealth();
    pipelineRunning = health.isRunning;
    lastRealtimeCycleAt = health.lastRealtimeRun?.toISOString() ?? null;
  } catch (err) {
    logger.warn({ err }, '[Freshness] 파이프라인 상태 조회 실패');
  }

  // 종합 판정 — 핵심 소스(센서·이벤트) 중 최악 상태
  const core = sources.filter((s) => s.source.startsWith('smaxtec'));
  const rank: Record<FreshnessStatus, number> = { live: 0, delayed: 1, stale: 2, none: 3 };
  const overall = core.reduce<FreshnessStatus>(
    (worst, s) => (rank[s.status] > rank[worst] ? s.status : worst),
    'live',
  );

  const report: DataFreshnessReport = {
    checkedAt: new Date().toISOString(),
    pipelineRunning,
    lastRealtimeCycleAt,
    overall,
    sources,
  };
  cached = { report, expiresAt: Date.now() + CACHE_TTL_MS };
  return report;
}

/** 테스트용 — 캐시 초기화 */
export function clearFreshnessCache(): void {
  cached = null;
}

const STATUS_KO: Readonly<Record<FreshnessStatus, string>> = {
  live: '실시간',
  delayed: '지연',
  stale: '오래됨',
  none: '데이터 없음',
};

/** 팅커벨 프롬프트 주입용 한 줄 요약 — AI가 데이터 기준 시점을 정직하게 말하게 한다. */
export function formatFreshnessLine(report: DataFreshnessReport): string {
  const sensor = report.sources.find((s) => s.source === 'smaxtec_sensors');
  const events = report.sources.find((s) => s.source === 'smaxtec_events');
  const parts: string[] = [];
  if (sensor) {
    parts.push(`센서 ${STATUS_KO[sensor.status]}${sensor.ageMinutes !== null ? `(${String(sensor.ageMinutes)}분 전)` : ''}`);
  }
  if (events) {
    parts.push(`이벤트 ${STATUS_KO[events.status]}${events.ageMinutes !== null ? `(${String(events.ageMinutes)}분 전)` : ''}`);
  }
  parts.push(`파이프라인 ${report.pipelineRunning ? '가동 중' : '정지'}`);
  const caveat = report.overall === 'live'
    ? ''
    : ' — 데이터가 실시간이 아닐 수 있으니 답변에 기준 시점을 명시하세요.';
  return `데이터 신선도: ${parts.join(' · ')}${caveat}`;
}
