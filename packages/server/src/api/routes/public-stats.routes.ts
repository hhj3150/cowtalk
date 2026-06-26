// 공개 통계 라우트 — 인증 불필요, 로그인 페이지 히어로 섹션용
// 실제 DB에서 농장 수, 두수, 센서 수, 활성 알림 등을 집계

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../../config/database.js';
import { farms, animals, smaxtecEvents, users } from '../../db/schema.js';
import { eq, count, gt, and, isNotNull, isNull } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

export const publicStatsRouter = Router();

// ── 인메모리 캐시 (5분) ──

interface CachedStats {
  readonly data: PublicStats;
  readonly expiresAt: number;
}

/**
 * CowTalk 자체 AI 엔진 목록 — '6 AI 엔진' 하드코딩 숫자를 실제 enumerated 목록으로 대체.
 * aiEngines 카운트의 단일 근거(ground truth). smaXtec 발정 엔진은 외부(smaXtec) 자산이라 제외.
 */
export const AI_ENGINES: readonly string[] = [
  'Claude LLM 해석 엔진',
  'v4 룰 엔진 (fallback)',
  '번식 AI (수정적기·정액추천)',
  '감별진단 엔진',
  '방역 인텔리전스',
  '알람 신뢰도 학습 루프',
];

interface PublicStats {
  readonly totalFarms: number;
  readonly totalCattle: number;
  readonly totalSensors: number;
  // 누적 모니터링 이벤트 — 실 DB(smaxtec_events) 카운트. '데이터로 말한다'의 정량 근거.
  readonly totalEvents: number;
  // D4/D5 (BUG-008 amend): detectionAccuracy '95%+' hardcoded marketing 제거.
  // 로그인 전 hero에 ground truth 없는 정확도 표시 = false positive.
  readonly aiEngines: number;
  readonly monitoring: string;
  readonly todayAlerts: number;
  readonly roleStats: readonly RoleStat[];
}

interface RoleStat {
  readonly role: string;
  readonly userCount: number;
  readonly farmCount: number;
  readonly cattleCount: number;
}

/** DB 집계 원시 카운트 → PublicStats 조립 (순수 함수, 테스트 가능). */
export interface RawStatCounts {
  readonly totalFarms: number;
  readonly totalCattle: number;
  readonly totalSensors: number;
  readonly totalEvents: number;
  readonly todayAlerts: number;
  readonly roleStats: readonly RoleStat[];
}

export function assemblePublicStats(raw: RawStatCounts): PublicStats {
  return {
    totalFarms: raw.totalFarms,
    totalCattle: raw.totalCattle,
    totalSensors: raw.totalSensors,
    totalEvents: raw.totalEvents,
    aiEngines: AI_ENGINES.length, // 하드코딩 6 → 실제 엔진 목록 길이
    monitoring: '24/7',
    todayAlerts: raw.todayAlerts,
    roleStats: raw.roleStats,
  };
}

let statsCache: CachedStats | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

// GET /api/public/stats — 인증 불필요
publicStatsRouter.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // 캐시 유효하면 즉시 반환
    if (statsCache && Date.now() < statsCache.expiresAt) {
      res.json({ success: true, data: statsCache.data });
      return;
    }

    const db = getDb();

    // 병렬 쿼리
    const [
      farmResult,
      animalResult,
      sensorResult,
      todayAlertResult,
      totalEventResult,
      roleResult,
    ] = await Promise.all([
      // 1. 활성 농장 수 (두수는 #2 라이브 카운트 사용 — D7/D9 단일 소스)
      db.select({
        farmCount: count(),
      })
        .from(farms)
        .where(eq(farms.status, 'active')),

      // 2. 라이브 두수 (D7) — animals 활성 카운트. public 노출 = 라이브 (D9).
      //    deletedAt IS NULL 포함 → getHerdTotal(인증 화면)과 동일 정의 보장.
      db.select({ animalCount: count() })
        .from(animals)
        .where(and(eq(animals.status, 'active'), isNull(animals.deletedAt))),

      // 3. 센서 부착 동물 수 (currentDeviceId가 있으면 센서 부착) — D7 동일 기준
      db.select({ sensorCount: count() })
        .from(animals)
        .where(and(
          eq(animals.status, 'active'),
          isNull(animals.deletedAt),
          isNotNull(animals.currentDeviceId),
        )),

      // 4. 최근 24시간 알림 수 (자정 리셋 방지)
      (() => {
        const todayStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return db.select({ alertCount: count() })
          .from(smaxtecEvents)
          .where(gt(smaxtecEvents.detectedAt, todayStart));
      })(),

      // 5. 누적 모니터링 이벤트 (smaxtec_events 전체)
      db.select({ eventCount: count() }).from(smaxtecEvents),

      // 6. 역할별 사용자 수
      db.select({
        role: users.role,
        userCount: count(),
      })
        .from(users)
        .where(eq(users.status, 'active'))
        .groupBy(users.role),
    ]);

    const stats: PublicStats = assemblePublicStats({
      totalFarms: Number(farmResult[0]?.farmCount ?? 0),
      totalCattle: Number(animalResult[0]?.animalCount ?? 0),
      totalSensors: Number(sensorResult[0]?.sensorCount ?? 0),
      totalEvents: Number(totalEventResult[0]?.eventCount ?? 0),
      todayAlerts: Number(todayAlertResult[0]?.alertCount ?? 0),
      roleStats: roleResult.map((r) => ({
        role: r.role,
        userCount: Number(r.userCount),
        farmCount: 0, // 심플하게
        cattleCount: 0,
      })),
    });

    // 캐시 갱신
    statsCache = {
      data: stats,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    logger.info(
      { totalFarms: stats.totalFarms, totalCattle: stats.totalCattle, totalSensors: stats.totalSensors, totalEvents: stats.totalEvents, todayAlerts: stats.todayAlerts },
      '[PublicStats] Stats refreshed',
    );

    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});
