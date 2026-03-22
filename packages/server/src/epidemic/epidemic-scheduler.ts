// 전염병 스캔 스케줄러
// 30분 주기로 클러스터 감지 → AI 해석 → 에스컬레이션

import { and, gte, desc } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import { smaxtecEvents, farms } from '../db/schema.js';
import { CLUSTER_DETECTION, EPIDEMIC_SCAN_INTERVAL_MS } from '@cowtalk/shared/constants';
import {
  aggregateEventsByFarm,
  detectClusters,
  type HealthEventRecord,
} from './cluster-detector.js';
import { assessProximityRisk } from './spread-analyzer.js';
import {
  insertCluster,
  getActiveClusters,
  updateCluster,
  createWarning,
  upsertDailySnapshot,
} from './cluster-repository.js';
import { interpretEpidemic } from '../ai-brain/claude-interpreter.js';
import { buildEscalationPlan, shouldEscalate } from '../ai-brain/alert/epidemic-escalation.js';
import type { FarmWithCoordinates } from './geo-utils.js';
import type { EpidemicAlertLevel } from '@cowtalk/shared';
import { logger } from '../lib/logger.js';

let scanTimer: ReturnType<typeof setInterval> | null = null;

// ======================================================================
// 스케줄러 시작/중지
// ======================================================================

export function startEpidemicScheduler(): void {
  if (scanTimer) {
    logger.warn('Epidemic scheduler already running');
    return;
  }

  logger.info(
    { intervalMs: EPIDEMIC_SCAN_INTERVAL_MS },
    'Starting epidemic scheduler',
  );

  // 초기 스캔 (5초 후)
  setTimeout(() => {
    runEpidemicScan().catch((err) =>
      logger.error({ err }, 'Initial epidemic scan failed'),
    );
  }, 5000);

  scanTimer = setInterval(() => {
    runEpidemicScan().catch((err) =>
      logger.error({ err }, 'Scheduled epidemic scan failed'),
    );
  }, EPIDEMIC_SCAN_INTERVAL_MS);
}

export function stopEpidemicScheduler(): void {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
    logger.info('Epidemic scheduler stopped');
  }
}

// ======================================================================
// 핵심: 전염병 스캔
// ======================================================================

export interface ScanResult {
  readonly scannedAt: Date;
  readonly totalHealthEvents: number;
  readonly newClusters: number;
  readonly updatedClusters: number;
  readonly warningsIssued: number;
}

export async function runEpidemicScan(): Promise<ScanResult> {
  const startTime = Date.now();
  logger.info('Starting epidemic scan');

  const db = getDb();

  // 1. 시간 윈도우 내 건강 이벤트 조회
  const since = new Date(Date.now() - CLUSTER_DETECTION.TIME_WINDOW_HOURS * 60 * 60 * 1000);

  const healthEventRows = await db
    .select({
      eventId: smaxtecEvents.eventId,
      eventType: smaxtecEvents.eventType,
      detectedAt: smaxtecEvents.detectedAt,
      severity: smaxtecEvents.severity,
      animalId: smaxtecEvents.animalId,
      farmId: smaxtecEvents.farmId,
    })
    .from(smaxtecEvents)
    .where(
      and(
        gte(smaxtecEvents.detectedAt, since),
      ),
    )
    .orderBy(desc(smaxtecEvents.detectedAt));

  // 전염병 관련 이벤트만 필터
  const { isEpidemicRelevantEvent } = await import('./cluster-detector.js');
  const relevantEvents: HealthEventRecord[] = healthEventRows
    .filter((row) => isEpidemicRelevantEvent(row.eventType))
    .map((row) => ({
      eventId: row.eventId,
      eventType: row.eventType,
      detectedAt: row.detectedAt,
      severity: row.severity,
      animalId: row.animalId,
    }));

  if (relevantEvents.length === 0) {
    logger.info('No epidemic-relevant events found');
    return {
      scannedAt: new Date(),
      totalHealthEvents: 0,
      newClusters: 0,
      updatedClusters: 0,
      warningsIssued: 0,
    };
  }

  // 2. 전체 농장 좌표 조회
  const allFarms = await db
    .select({
      farmId: farms.farmId,
      farmName: farms.name,
      lat: farms.lat,
      lng: farms.lng,
    })
    .from(farms);

  const farmCoordinates: FarmWithCoordinates[] = allFarms
    .filter((f) => f.lat !== null && f.lng !== null)
    .map((f) => ({
      farmId: f.farmId,
      farmName: f.farmName,
      coordinates: { lat: f.lat!, lng: f.lng! },
    }));

  // 3. 농장별 이벤트 집계
  const farmIdToEvents = new Map<string, HealthEventRecord[]>();
  for (const evt of relevantEvents) {
    const farmId = healthEventRows.find((r) => r.eventId === evt.eventId)?.farmId;
    if (!farmId) continue;
    const existing = farmIdToEvents.get(farmId) ?? [];
    farmIdToEvents.set(farmId, [...existing, evt]);
  }

  const farmAggregates = aggregateEventsByFarm(
    relevantEvents,
    farmCoordinates,
    farmIdToEvents,
  );

  // 4. 클러스터 감지
  const detectedClusters = detectClusters(farmAggregates);

  if (detectedClusters.length === 0) {
    logger.info({ totalEvents: relevantEvents.length }, 'No disease clusters detected');
    await saveDailySnapshot(db, relevantEvents.length, 0, 'normal');
    return {
      scannedAt: new Date(),
      totalHealthEvents: relevantEvents.length,
      newClusters: 0,
      updatedClusters: 0,
      warningsIssued: 0,
    };
  }

  // 5. 기존 활성 클러스터와 비교
  const existingClusters = await getActiveClusters(db);
  let newClusterCount = 0;
  let updatedClusterCount = 0;
  let warningsIssued = 0;

  for (const detected of detectedClusters) {
    // 기존 클러스터와 매칭 (같은 질병 타입 + 중심점 근접)
    const matchingExisting = existingClusters.find(
      (ec) =>
        ec.diseaseType === detected.diseaseType &&
        Math.abs(ec.centerLat - detected.center.lat) < 0.1 &&
        Math.abs(ec.centerLng - detected.center.lng) < 0.1,
    );

    if (matchingExisting) {
      // 기존 클러스터 업데이트
      const previousLevel = matchingExisting.level as EpidemicAlertLevel;
      await updateCluster(db, matchingExisting.clusterId, {
        level: detected.level,
        farmCount: detected.farms.length,
        eventCount: detected.totalEvents,
        spreadRateFarmsPerDay: detected.spreadRate.farmsPerDay,
        spreadRateEventsPerDay: detected.spreadRate.eventsPerDay,
        spreadTrend: detected.spreadRate.trend,
        centerLat: detected.center.lat,
        centerLng: detected.center.lng,
        radiusKm: detected.radiusKm,
      });
      updatedClusterCount++;

      // 레벨 상승 시 새 경보 발행
      if (shouldEscalate(previousLevel, detected.level)) {
        const warningId = await issueWarning(db, matchingExisting.clusterId, detected, farmCoordinates);
        if (warningId) warningsIssued++;
      }
    } else {
      // 신규 클러스터 삽입
      const clusterId = await insertCluster(db, detected);
      newClusterCount++;

      // 신규 클러스터 경보
      const warningId = await issueWarning(db, clusterId, detected, farmCoordinates);
      if (warningId) warningsIssued++;
    }
  }

  // 6. 일일 스냅샷 갱신
  const highestLevel = detectedClusters.reduce<EpidemicAlertLevel>((max, c) => {
    const order: Record<string, number> = { normal: 0, watch: 1, warning: 2, outbreak: 3 };
    return (order[c.level] ?? 0) > (order[max] ?? 0) ? c.level : max;
  }, 'normal');

  await saveDailySnapshot(db, relevantEvents.length, detectedClusters.length, highestLevel);

  const elapsed = Date.now() - startTime;
  logger.info(
    {
      elapsed,
      totalEvents: relevantEvents.length,
      newClusters: newClusterCount,
      updatedClusters: updatedClusterCount,
      warningsIssued,
    },
    'Epidemic scan completed',
  );

  return {
    scannedAt: new Date(),
    totalHealthEvents: relevantEvents.length,
    newClusters: newClusterCount,
    updatedClusters: updatedClusterCount,
    warningsIssued,
  };
}

// ======================================================================
// 내부 함수
// ======================================================================

async function issueWarning(
  db: ReturnType<typeof getDb>,
  clusterId: string,
  detected: ReturnType<typeof detectClusters>[number],
  allFarms: readonly FarmWithCoordinates[],
): Promise<string | null> {
  try {
    // 근접 농장 위험도 분석
    const nearbyRisks = assessProximityRisk(detected, allFarms);

    // Claude AI 해석
    const interpretation = await interpretEpidemic(detected, nearbyRisks, 'quarantine_officer');

    // 경보 생성
    const warningId = await createWarning(db, {
      clusterId,
      level: detected.level,
      scope: detected.farms.length >= 10 ? 'province' : 'district',
      aiInterpretation: interpretation,
    });

    // 에스컬레이션 계획 생성 (알림 발송은 notification 모듈에 위임)
    const warning = {
      warningId,
      clusterId,
      level: detected.level as EpidemicAlertLevel,
      scope: 'district' as const,
      regionId: null,
      spreadRate: {
        farmsPerDay: detected.spreadRate.farmsPerDay,
        eventsPerDay: detected.spreadRate.eventsPerDay,
        direction: null,
        trend: detected.spreadRate.trend,
      },
      aiInterpretation: interpretation,
      status: 'active' as const,
      createdAt: new Date(),
      resolvedAt: null,
    };

    buildEscalationPlan(warning);

    return warningId;
  } catch (error) {
    logger.error({ clusterId, error }, 'Failed to issue epidemic warning');
    return null;
  }
}

async function saveDailySnapshot(
  db: ReturnType<typeof getDb>,
  totalHealthEvents: number,
  clusterCount: number,
  warningLevel: string,
): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0] ?? '';
    await upsertDailySnapshot(db, {
      date: today,
      clusterCount,
      warningLevel,
      totalHealthEvents,
      totalAffectedFarms: 0,
      totalAffectedAnimals: 0,
      metrics: { scannedAt: new Date().toISOString() },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to save daily epidemic snapshot');
  }
}
