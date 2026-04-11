// 번식 피드백 서비스 — 수태율 통계 (정액별·개체별·목장별)
// 팅커벨 tool_use query_conception_stats로 AI가 활용
// getFarmSemenPerformance: 추천 엔진에 학습 근거(목장 내 과거 수태율) 주입

import { getDb } from '../../config/database.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

// ===========================
// 학습 근거: 목장 내 정액별 과거 수태율
// ===========================

export interface SemenPerformance {
  readonly semenId: string;
  readonly inseminationCount: number;  // 이 목장에서 총 사용 횟수
  readonly pregnantCount: number;
  readonly openCount: number;
  readonly decidedCount: number;        // pregnant + open
  readonly conceptionRate: number;      // 0~100 (decided 기준)
}

/**
 * 목장 내 정액별 과거 수태율 Map 반환 (최근 2년)
 * breeding-advisor가 학습 가산점 계산에 사용
 * - semen_id NULL 건은 제외 (semenInfo 텍스트는 매칭 불가)
 * - 결정된 건(pregnant+open)만 수태율 계산에 반영
 */
export async function getFarmSemenPerformance(
  farmId: string,
): Promise<Map<string, SemenPerformance>> {
  const db = getDb();
  const cutoff = new Date(Date.now() - 730 * 86_400_000); // 2년
  const result = new Map<string, SemenPerformance>();

  try {
    const rows = await db.execute(sql`
      SELECT
        be.semen_id,
        COUNT(*)::int AS insem_count,
        COUNT(CASE WHEN pc.result = 'pregnant' THEN 1 END)::int AS pregnant_count,
        COUNT(CASE WHEN pc.result = 'open' THEN 1 END)::int AS open_count
      FROM breeding_events be
      LEFT JOIN pregnancy_checks pc ON pc.animal_id = be.animal_id
        AND pc.check_date > be.event_date
        AND pc.check_date < be.event_date + INTERVAL '120 days'
      WHERE be.type = 'insemination'
        AND be.farm_id = ${farmId}
        AND be.semen_id IS NOT NULL
        AND be.event_date >= ${cutoff}
      GROUP BY be.semen_id
    `);

    for (const row of rows as unknown as Array<{
      semen_id: string;
      insem_count: number;
      pregnant_count: number;
      open_count: number;
    }>) {
      const decided = row.pregnant_count + row.open_count;
      const conceptionRate = decided > 0
        ? Math.round((row.pregnant_count / decided) * 100)
        : 0;
      result.set(row.semen_id, {
        semenId: row.semen_id,
        inseminationCount: row.insem_count,
        pregnantCount: row.pregnant_count,
        openCount: row.open_count,
        decidedCount: decided,
        conceptionRate,
      });
    }

    return result;
  } catch (error) {
    logger.error({ error, farmId }, '[BreedingFeedback] 정액 성과 조회 실패');
    return result;
  }
}

// ===========================
// 타입
// ===========================

export interface ConceptionStats {
  readonly farmId: string | null;
  readonly farmName: string | null;
  readonly overall: {
    readonly totalInseminations: number;
    readonly pregnantCount: number;
    readonly openCount: number;
    readonly pendingCount: number;
    readonly conceptionRate: number; // %
  };
  readonly bySemen: readonly SemenConceptionRate[];
  readonly byAnimal: readonly AnimalConceptionRate[];
}

export interface SemenConceptionRate {
  readonly semenInfo: string;
  readonly inseminationCount: number;
  readonly pregnantCount: number;
  readonly openCount: number;
  readonly conceptionRate: number;
}

export interface AnimalConceptionRate {
  readonly animalId: string;
  readonly earTag: string;
  readonly inseminationCount: number;
  readonly pregnantCount: number;
  readonly conceptionRate: number;
  readonly lastInseminationDate: string | null;
}

// ===========================
// 수태율 통계 조회
// ===========================

export async function computeConceptionStats(farmId?: string): Promise<ConceptionStats> {
  const db = getDb();
  const cutoff = new Date(Date.now() - 365 * 86_400_000); // 최근 1년

  try {
    const farmFilter = farmId
      ? sql`AND be.farm_id = ${farmId}`
      : sql``;

    // 전체 수태율
    const overallRows = await db.execute(sql`
      SELECT
        COUNT(DISTINCT be.event_id)::int as total_inseminations,
        COUNT(DISTINCT CASE WHEN pc.result = 'pregnant' THEN be.event_id END)::int as pregnant_count,
        COUNT(DISTINCT CASE WHEN pc.result = 'open' THEN be.event_id END)::int as open_count
      FROM breeding_events be
      LEFT JOIN pregnancy_checks pc ON pc.animal_id = be.animal_id
        AND pc.check_date > be.event_date
        AND pc.check_date < be.event_date + INTERVAL '120 days'
      WHERE be.type = 'insemination'
        AND be.event_date >= ${cutoff}
        ${farmFilter}
    `);

    const overall = (overallRows as unknown as Array<{
      total_inseminations: number;
      pregnant_count: number;
      open_count: number;
    }>)[0] ?? { total_inseminations: 0, pregnant_count: 0, open_count: 0 };

    const decided = overall.pregnant_count + overall.open_count;
    const pendingCount = overall.total_inseminations - decided;
    const conceptionRate = decided > 0
      ? Math.round((overall.pregnant_count / decided) * 100)
      : 0;

    // 정액별 수태율
    const semenRows = await db.execute(sql`
      SELECT
        COALESCE(be.semen_info, '미기록') as semen_info,
        COUNT(*)::int as insem_count,
        COUNT(CASE WHEN pc.result = 'pregnant' THEN 1 END)::int as pregnant_count,
        COUNT(CASE WHEN pc.result = 'open' THEN 1 END)::int as open_count
      FROM breeding_events be
      LEFT JOIN pregnancy_checks pc ON pc.animal_id = be.animal_id
        AND pc.check_date > be.event_date
        AND pc.check_date < be.event_date + INTERVAL '120 days'
      WHERE be.type = 'insemination'
        AND be.event_date >= ${cutoff}
        ${farmFilter}
      GROUP BY COALESCE(be.semen_info, '미기록')
      HAVING COUNT(*) >= 2
      ORDER BY COUNT(*) DESC
      LIMIT 20
    `);

    const bySemen: SemenConceptionRate[] = (semenRows as unknown as Array<{
      semen_info: string;
      insem_count: number;
      pregnant_count: number;
      open_count: number;
    }>).map((r) => {
      const dec = r.pregnant_count + r.open_count;
      return {
        semenInfo: r.semen_info,
        inseminationCount: r.insem_count,
        pregnantCount: r.pregnant_count,
        openCount: r.open_count,
        conceptionRate: dec > 0 ? Math.round((r.pregnant_count / dec) * 100) : 0,
      };
    });

    // 개체별 수태율 (3회 이상 수정 개체만)
    const animalRows = await db.execute(sql`
      SELECT
        be.animal_id,
        a.ear_tag,
        COUNT(*)::int as insem_count,
        COUNT(CASE WHEN pc.result = 'pregnant' THEN 1 END)::int as pregnant_count,
        MAX(be.event_date)::text as last_insem_date
      FROM breeding_events be
      JOIN animals a ON a.animal_id = be.animal_id
      LEFT JOIN pregnancy_checks pc ON pc.animal_id = be.animal_id
        AND pc.check_date > be.event_date
        AND pc.check_date < be.event_date + INTERVAL '120 days'
      WHERE be.type = 'insemination'
        AND be.event_date >= ${cutoff}
        AND a.status = 'active'
        ${farmFilter}
      GROUP BY be.animal_id, a.ear_tag
      HAVING COUNT(*) >= 2
      ORDER BY COUNT(*) DESC
      LIMIT 20
    `);

    const byAnimal: AnimalConceptionRate[] = (animalRows as unknown as Array<{
      animal_id: string;
      ear_tag: string;
      insem_count: number;
      pregnant_count: number;
      last_insem_date: string | null;
    }>).map((r) => ({
      animalId: r.animal_id,
      earTag: r.ear_tag,
      inseminationCount: r.insem_count,
      pregnantCount: r.pregnant_count,
      conceptionRate: r.insem_count > 0 ? Math.round((r.pregnant_count / r.insem_count) * 100) : 0,
      lastInseminationDate: r.last_insem_date,
    }));

    // 농장명
    let farmName: string | null = null;
    if (farmId) {
      const [farmRow] = await db.execute(sql`SELECT name FROM farms WHERE farm_id = ${farmId} LIMIT 1`);
      farmName = (farmRow as unknown as { name: string })?.name ?? null;
    }

    return {
      farmId: farmId ?? null,
      farmName,
      overall: {
        totalInseminations: overall.total_inseminations,
        pregnantCount: overall.pregnant_count,
        openCount: overall.open_count,
        pendingCount,
        conceptionRate,
      },
      bySemen,
      byAnimal,
    };
  } catch (error) {
    logger.error({ error, farmId }, '[BreedingFeedback] 수태율 통계 조회 실패');
    return {
      farmId: farmId ?? null,
      farmName: null,
      overall: { totalInseminations: 0, pregnantCount: 0, openCount: 0, pendingCount: 0, conceptionRate: 0 },
      bySemen: [],
      byAnimal: [],
    };
  }
}
