// 개체별 기저체온 프로파일 — 7일 시간대별 평균+표준편차 기반 Level 평가
// lactationStatus 보정 포함 (dry +0.2, pregnant_late +0.3)

import { getDb } from '../../config/database.js';
import { sensorHourlyAgg, animals } from '../../db/schema.js';
import { eq, gte, and } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

// ===========================
// 타입
// ===========================

export type TempAlertLevel = 1 | 2 | 3;

export interface TempEvaluationResult {
  readonly level: TempAlertLevel | null;  // null = 정상
  readonly currentTemp: number;
  readonly baselineAvg: number;
  readonly delta: number;           // 현재 - 기저선 평균
  readonly deltaFromStddev: number; // (delta) / stddev
  readonly rapidRise: boolean;      // 2시간 내 0.5°C+ 상승
  readonly rapidFall: boolean;      // 2시간 내 0.5°C+ 하강
  readonly lactationAdjustment: number;
}

interface HourlyBaseline {
  readonly hour: number;   // 0-23
  readonly avg: number;
  readonly stddev: number;
}

interface BaselineProfile {
  readonly animalId: string;
  readonly hourlyBaselines: readonly HourlyBaseline[];
  readonly lactationStatus: string;
  readonly builtAt: number;  // Date.now()
}

// ===========================
// 인메모리 캐시 (30분 TTL)
// ===========================

const CACHE_TTL_MS = 30 * 60 * 1000;
const profileCache = new Map<string, BaselineProfile>();

function getCached(animalId: string): BaselineProfile | null {
  const cached = profileCache.get(animalId);
  if (!cached) return null;
  if (Date.now() - cached.builtAt > CACHE_TTL_MS) {
    profileCache.delete(animalId);
    return null;
  }
  return cached;
}

// ===========================
// lactationStatus 체온 보정
// ===========================

const LACTATION_ADJUSTMENTS: Readonly<Record<string, number>> = {
  dry: 0.2,
  pregnant_late: 0.3,
} as const;

function getLactationAdjustment(status: string): number {
  return LACTATION_ADJUSTMENTS[status] ?? 0;
}

// ===========================
// 기저체온 프로파일 구축
// ===========================

export async function buildBaseline(animalId: string): Promise<BaselineProfile> {
  const cached = getCached(animalId);
  if (cached) return cached;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const db = getDb();
  const [animalRow, hourlyRows] = await Promise.all([
    db.select({ lactationStatus: animals.lactationStatus })
      .from(animals)
      .where(eq(animals.animalId, animalId))
      .limit(1),

    db.select({ hour: sensorHourlyAgg.hour, avg: sensorHourlyAgg.avg, stddev: sensorHourlyAgg.stddev })
      .from(sensorHourlyAgg)
      .where(and(
        eq(sensorHourlyAgg.animalId, animalId),
        eq(sensorHourlyAgg.metricType, 'temperature'),
        gte(sensorHourlyAgg.hour, sevenDaysAgo),
      )),
  ]);

  const lactationStatus = animalRow[0]?.lactationStatus ?? 'unknown';

  // 시간대별(0-23) 집계
  const byHour = new Map<number, { sum: number; sumSq: number; count: number }>();
  for (const row of hourlyRows) {
    const h = new Date(row.hour).getUTCHours();
    const existing = byHour.get(h) ?? { sum: 0, sumSq: 0, count: 0 };
    byHour.set(h, {
      sum: existing.sum + row.avg,
      sumSq: existing.sumSq + row.avg ** 2,
      count: existing.count + 1,
    });
  }

  const hourlyBaselines: HourlyBaseline[] = [];
  for (let h = 0; h < 24; h++) {
    const agg = byHour.get(h);
    if (!agg || agg.count === 0) {
      // 데이터 없는 시간대 → 기본값 38.5°C
      hourlyBaselines.push({ hour: h, avg: 38.5, stddev: 0.3 });
      continue;
    }
    const avg = agg.sum / agg.count;
    const variance = agg.sumSq / agg.count - avg ** 2;
    const stddev = Math.max(Math.sqrt(Math.max(variance, 0)), 0.1);
    hourlyBaselines.push({ hour: h, avg, stddev });
  }

  const profile: BaselineProfile = {
    animalId,
    hourlyBaselines,
    lactationStatus,
    builtAt: Date.now(),
  };

  profileCache.set(animalId, profile);
  return profile;
}

// ===========================
// 체온 평가 — Level 1/2/3
// ===========================

export async function evaluate(
  animalId: string,
  currentTemp: number,
  recentTemps: readonly number[],  // 최근 2시간 측정값 (오래된 순)
): Promise<TempEvaluationResult> {
  let profile: BaselineProfile;
  try {
    profile = await buildBaseline(animalId);
  } catch (err) {
    logger.warn({ err, animalId }, '[TempProfile] buildBaseline failed, using defaults');
    profile = {
      animalId,
      hourlyBaselines: Array.from({ length: 24 }, (_, h) => ({ hour: h, avg: 38.5, stddev: 0.3 })),
      lactationStatus: 'unknown',
      builtAt: Date.now(),
    };
  }

  const currentHour = new Date().getUTCHours();
  const baseline = profile.hourlyBaselines.find((b) => b.hour === currentHour)
    ?? profile.hourlyBaselines[0]
    ?? { hour: currentHour, avg: 38.5, stddev: 0.3 };

  const adjustment = getLactationAdjustment(profile.lactationStatus);
  const adjustedAvg = baseline.avg + adjustment;
  const delta = currentTemp - adjustedAvg;
  const deltaFromStddev = delta / baseline.stddev;

  // 급상승/급하강 감지 (2시간 내 0.5°C 이상 변화)
  let rapidRise = false;
  let rapidFall = false;
  if (recentTemps.length >= 2) {
    const oldest = recentTemps[0] ?? currentTemp;
    const change = currentTemp - oldest;
    if (change >= 0.5) rapidRise = true;
    if (change <= -0.5) rapidFall = true;
  }

  // Level 결정
  // Level 3: +1.5°C 이상 OR >= 40.0°C OR 급상승+고열
  // Level 2: +1.0°C 이상 OR >= 39.5°C
  // Level 1: +0.5°C 이상 OR >= 39.0°C (2시간 지속)
  let level: TempAlertLevel | null = null;

  if (delta >= 1.5 || currentTemp >= 40.0 || (rapidRise && currentTemp >= 39.5)) {
    level = 3;
  } else if (delta >= 1.0 || currentTemp >= 39.5) {
    level = 2;
  } else if (delta >= 0.5 || currentTemp >= 39.0) {
    level = 1;
  }

  return {
    level,
    currentTemp,
    baselineAvg: adjustedAvg,
    delta,
    deltaFromStddev,
    rapidRise,
    rapidFall,
    lactationAdjustment: adjustment,
  };
}

/** 캐시 무효화 (테스트용) */
export function clearProfileCache(animalId?: string): void {
  if (animalId) {
    profileCache.delete(animalId);
  } else {
    profileCache.clear();
  }
}
