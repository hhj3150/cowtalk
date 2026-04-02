// 번식 피드백 서비스 — 수태율 통계 (정액별·개체별·목장별)
// 팅커벨 tool_use query_conception_stats로 AI가 활용

import { getDb } from '../../config/database.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

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
