/**
 * 패턴 마이닝 서비스 — alarm_pattern_snapshots에서 학습 데이터 추출
 *
 * 완성된 스냅샷(before+after)에서 특성 벡터를 추출하고,
 * 이벤트 타입별 "전형적 패턴"을 요약하여 유사 사례 검색 기반을 제공한다.
 *
 * 활용:
 * 1. 수의사 감별진단 고도화 — "이전에 비슷한 센서 패턴이 있었는데 결과는 X였다"
 * 2. 룰 임계값 검증 — 특성 벡터 분포로 현재 룰 민감도 적합성 판단
 * 3. ML 학습 데이터 — 스냅샷 → feature matrix → 분류 모델 훈련
 */

import { getDb } from '../../config/database.js';
import { alarmPatternSnapshots } from '../../db/schema.js';
import { and, eq, sql } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

// ─── 타입 ───────────────────────────────────────────────────────

interface DailyEntry {
  readonly date: string;
  readonly temp_avg: number | null;
  readonly rum_avg: number | null;
  readonly act_avg: number | null;
}

interface SensorSnapshot {
  readonly daily: readonly DailyEntry[];
}

/** 스냅샷에서 추출한 특성 벡터 */
export interface PatternFeatures {
  readonly snapshotId: string;
  readonly animalId: string;
  readonly farmId: string;
  readonly eventType: string;
  readonly eventDetectedAt: string;
  // before 특성 (이벤트 전 48h)
  readonly beforeTempMean: number | null;
  readonly beforeTempTrend: number | null;  // 기울기 (°C/day)
  readonly beforeRumMean: number | null;
  readonly beforeRumTrend: number | null;
  readonly beforeActMean: number | null;
  readonly beforeActTrend: number | null;
  // after 특성 (이벤트 후 48h)
  readonly afterTempMean: number | null;
  readonly afterTempTrend: number | null;
  readonly afterRumMean: number | null;
  readonly afterRumTrend: number | null;
  readonly afterActMean: number | null;
  readonly afterActTrend: number | null;
  // 변화 지표
  readonly tempDelta: number | null;   // after - before 평균
  readonly rumDelta: number | null;
  readonly actDelta: number | null;
}

/** 이벤트 타입별 패턴 요약 */
export interface PatternSummary {
  readonly eventType: string;
  readonly sampleCount: number;
  readonly avgBeforeTempMean: number | null;
  readonly avgBeforeRumMean: number | null;
  readonly avgBeforeActMean: number | null;
  readonly avgTempDelta: number | null;
  readonly avgRumDelta: number | null;
  readonly avgActDelta: number | null;
  readonly typicalBeforeTempTrend: number | null;
  readonly typicalBeforeRumTrend: number | null;
}

export interface PatternMiningResult {
  readonly totalSnapshots: number;
  readonly completeSnapshots: number;
  readonly featuresExtracted: number;
  readonly summaries: readonly PatternSummary[];
}

// ─── 메인 ───────────────────────────────────────────────────────

/**
 * 완료된 스냅샷에서 특성 벡터 추출 (전체 또는 특정 이벤트 타입)
 */
export async function extractPatternFeatures(
  eventType?: string,
  farmId?: string,
  limit = 500,
): Promise<readonly PatternFeatures[]> {
  const db = getDb();

  const filters = [eq(alarmPatternSnapshots.captureStatus, 'complete')];
  if (eventType) filters.push(eq(alarmPatternSnapshots.eventType, eventType));
  if (farmId) filters.push(eq(alarmPatternSnapshots.farmId, farmId));

  const snapshots = await db.select()
    .from(alarmPatternSnapshots)
    .where(and(...filters))
    .limit(limit);

  return snapshots.map(snap => {
    const before = snap.sensorBefore as SensorSnapshot | null;
    const after = snap.sensorAfter as SensorSnapshot | null;

    const beforeStats = computeStats(before?.daily ?? []);
    const afterStats = computeStats(after?.daily ?? []);

    return {
      snapshotId: snap.snapshotId,
      animalId: snap.animalId,
      farmId: snap.farmId,
      eventType: snap.eventType,
      eventDetectedAt: snap.eventDetectedAt.toISOString(),
      // before
      beforeTempMean: beforeStats.tempMean,
      beforeTempTrend: beforeStats.tempTrend,
      beforeRumMean: beforeStats.rumMean,
      beforeRumTrend: beforeStats.rumTrend,
      beforeActMean: beforeStats.actMean,
      beforeActTrend: beforeStats.actTrend,
      // after
      afterTempMean: afterStats.tempMean,
      afterTempTrend: afterStats.tempTrend,
      afterRumMean: afterStats.rumMean,
      afterRumTrend: afterStats.rumTrend,
      afterActMean: afterStats.actMean,
      afterActTrend: afterStats.actTrend,
      // delta
      tempDelta: safeSubtract(afterStats.tempMean, beforeStats.tempMean),
      rumDelta: safeSubtract(afterStats.rumMean, beforeStats.rumMean),
      actDelta: safeSubtract(afterStats.actMean, beforeStats.actMean),
    };
  });
}

/**
 * 이벤트 타입별 전형적 패턴 요약 생성
 */
export async function computePatternSummaries(
  farmId?: string,
): Promise<readonly PatternSummary[]> {
  const features = await extractPatternFeatures(undefined, farmId, 2000);

  // eventType별 그룹
  const groups = new Map<string, PatternFeatures[]>();
  for (const f of features) {
    const existing = groups.get(f.eventType) ?? [];
    groups.set(f.eventType, [...existing, f]);
  }

  const summaries: PatternSummary[] = [];
  for (const [eventType, items] of groups.entries()) {
    if (items.length < 2) continue;

    summaries.push({
      eventType,
      sampleCount: items.length,
      avgBeforeTempMean: meanOf(items.map(i => i.beforeTempMean)),
      avgBeforeRumMean: meanOf(items.map(i => i.beforeRumMean)),
      avgBeforeActMean: meanOf(items.map(i => i.beforeActMean)),
      avgTempDelta: meanOf(items.map(i => i.tempDelta)),
      avgRumDelta: meanOf(items.map(i => i.rumDelta)),
      avgActDelta: meanOf(items.map(i => i.actDelta)),
      typicalBeforeTempTrend: meanOf(items.map(i => i.beforeTempTrend)),
      typicalBeforeRumTrend: meanOf(items.map(i => i.beforeRumTrend)),
    });
  }

  return summaries.sort((a, b) => b.sampleCount - a.sampleCount);
}

/**
 * 유사 패턴 검색 — 현재 센서 프로필과 가장 비슷한 과거 스냅샷 찾기
 * 수의사 감별진단에서 "이전에 비슷한 패턴 → 결과는 X" 참고용
 */
export async function findSimilarPatterns(
  currentProfile: {
    readonly tempMean: number | null;
    readonly rumMean: number | null;
    readonly actMean: number | null;
    readonly tempTrend: number | null;
    readonly rumTrend: number | null;
  },
  eventType?: string,
  topK = 5,
): Promise<readonly (PatternFeatures & { similarity: number })[]> {
  const features = await extractPatternFeatures(eventType, undefined, 1000);
  if (features.length === 0) return [];

  // 유클리드 거리 기반 유사도 (정규화)
  const scored = features.map(f => {
    const dist = euclideanDistance(
      [currentProfile.tempMean, currentProfile.rumMean, currentProfile.actMean, currentProfile.tempTrend, currentProfile.rumTrend],
      [f.beforeTempMean, f.beforeRumMean, f.beforeActMean, f.beforeTempTrend, f.beforeRumTrend],
      [1.0, 0.01, 0.1, 2.0, 0.02], // 정규화 가중치 (단위 스케일 차이 보정)
    );
    return { ...f, similarity: 1 / (1 + dist) }; // 0~1, 높을수록 유사
  });

  return scored
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

/**
 * 전체 패턴 마이닝 배치 실행 (24h 주기 권장)
 */
export async function runPatternMining(): Promise<PatternMiningResult> {
  const db = getDb();

  try {
    // 전체 스냅샷 카운트
    const [totalRow] = await db.execute(sql`
      SELECT count(*)::int AS total FROM alarm_pattern_snapshots
    `) as unknown as [{ total: number }];

    const [completeRow] = await db.execute(sql`
      SELECT count(*)::int AS complete FROM alarm_pattern_snapshots WHERE capture_status = 'complete'
    `) as unknown as [{ complete: number }];

    const summaries = await computePatternSummaries();
    const featuresExtracted = summaries.reduce((s, v) => s + v.sampleCount, 0);

    logger.info(
      {
        totalSnapshots: totalRow.total,
        completeSnapshots: completeRow.complete,
        featuresExtracted,
        summaryTypes: summaries.length,
      },
      '[PatternMining] 배치 완료',
    );

    return {
      totalSnapshots: totalRow.total,
      completeSnapshots: completeRow.complete,
      featuresExtracted,
      summaries,
    };
  } catch (error) {
    logger.error({ error }, '[PatternMining] 배치 실패');
    return { totalSnapshots: 0, completeSnapshots: 0, featuresExtracted: 0, summaries: [] };
  }
}

// ─── 헬퍼 ───────────────────────────────────────────────────────

interface DailyStats {
  readonly tempMean: number | null;
  readonly tempTrend: number | null;
  readonly rumMean: number | null;
  readonly rumTrend: number | null;
  readonly actMean: number | null;
  readonly actTrend: number | null;
}

function computeStats(daily: readonly DailyEntry[]): DailyStats {
  if (daily.length === 0) {
    return { tempMean: null, tempTrend: null, rumMean: null, rumTrend: null, actMean: null, actTrend: null };
  }

  const temps = daily.map(d => d.temp_avg).filter((v): v is number => v !== null);
  const rums = daily.map(d => d.rum_avg).filter((v): v is number => v !== null);
  const acts = daily.map(d => d.act_avg).filter((v): v is number => v !== null);

  return {
    tempMean: meanOf(temps),
    tempTrend: linearTrend(temps),
    rumMean: meanOf(rums),
    rumTrend: linearTrend(rums),
    actMean: meanOf(acts),
    actTrend: linearTrend(acts),
  };
}

function meanOf(values: readonly (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

/** 단순 선형 회귀 기울기 (단위/일) */
function linearTrend(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i]!;
    sumXY += i * values[i]!;
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function safeSubtract(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return a - b;
}

function euclideanDistance(
  a: readonly (number | null)[],
  b: readonly (number | null)[],
  weights: readonly number[],
): number {
  let sumSq = 0;
  let dims = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i];
    const vb = b[i];
    if (va === null || va === undefined || vb === null || vb === undefined) continue;
    const w = weights[i] ?? 1;
    const diff = va - vb;
    sumSq += w * diff * diff;
    dims++;
  }
  return dims > 0 ? Math.sqrt(sumSq / dims) : Infinity;
}
