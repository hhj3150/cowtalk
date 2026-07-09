// 프롬프트 개선 루프 — 4층 Intelligence Loop의 마지막 단계 (P4)
//
// 피드백(라벨) → 정확도 집계 → "프롬프트 개선"을 닫는다.
// 방식: sovereign_alarm_labels 90일 집계에서 결정적(rule-based) 가이던스 텍스트를 생성해
// prompt_guidances에 영속화하고, 팅커벨 대화 프롬프트에 주입한다.
// 원칙:
// - LLM이 자기 프롬프트를 재작성하지 않는다 — 감사 가능한 규칙 기반 텍스트만
// - 정직성: MIN_LABELS(10건) 미만 통계로는 가이던스를 만들지 않는다
// - 가이던스에는 항상 모수(라벨 N건)와 수치를 명시한다

import { getDb } from '../config/database.js';
import { promptGuidances, sovereignAlarmLabels } from '../db/schema.js';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

/** 가이던스 생성 최소 라벨 수 — 이 미만 통계는 노이즈로 간주 */
export const MIN_LABELS_FOR_GUIDANCE = 10;
const DEFAULT_WINDOW_DAYS = 90;
/** 프롬프트에 주입할 최대 가이던스 수 (농장 우선) */
const MAX_INJECTED_GUIDANCES = 6;

export interface AlarmLabelStats {
  readonly alarmType: string;
  readonly totalLabels: number;
  readonly confirmed: number;
  readonly falsePositive: number;
  readonly modified: number;
}

export interface GuidanceSourceStats {
  readonly totalLabels: number;
  readonly fpRate: number;
  readonly confirmRate: number;
  readonly modifiedRate: number;
  readonly windowDays: number;
}

export interface BuiltGuidance {
  readonly text: string;
  readonly stats: GuidanceSourceStats;
}

const pct = (v: number): number => Math.round(v * 100);

/**
 * 라벨 통계 → 가이던스 텍스트 (순수 함수 — 테스트 대상).
 * 어떤 규칙에도 걸리지 않으면 null — 가이던스를 억지로 만들지 않는다.
 */
export function buildGuidance(
  stats: AlarmLabelStats,
  scope: 'farm' | 'global',
  windowDays: number = DEFAULT_WINDOW_DAYS,
): BuiltGuidance | null {
  if (stats.totalLabels < MIN_LABELS_FOR_GUIDANCE) return null;

  const fpRate = stats.falsePositive / stats.totalLabels;
  const confirmRate = stats.confirmed / stats.totalLabels;
  const modifiedRate = stats.modified / stats.totalLabels;
  const scopeLabel = scope === 'farm' ? '이 농장' : '전국';
  const base: GuidanceSourceStats = {
    totalLabels: stats.totalLabels,
    fpRate: Math.round(fpRate * 1000) / 1000,
    confirmRate: Math.round(confirmRate * 1000) / 1000,
    modifiedRate: Math.round(modifiedRate * 1000) / 1000,
    windowDays,
  };

  // 우선순위: 오탐 경고 > 판정 수정 > 고신뢰
  if (fpRate >= 0.4) {
    return {
      text: `'${stats.alarmType}' 알람은 ${scopeLabel} 최근 ${windowDays}일 라벨 ${stats.totalLabels}건 중 오탐 ${pct(fpRate)}% — 이 알람을 근거로 답할 때는 단정하지 말고, 센서 추이·현장 관찰 등 추가 확인을 먼저 권하라.`,
      stats: base,
    };
  }
  if (modifiedRate >= 0.3) {
    return {
      text: `'${stats.alarmType}' 알람은 ${scopeLabel} 최근 ${windowDays}일 라벨 ${stats.totalLabels}건 중 ${pct(modifiedRate)}%가 다른 판정으로 수정됨 — 유형을 단정하지 말고 감별 후보를 함께 제시하라.`,
      stats: base,
    };
  }
  if (confirmRate >= 0.85) {
    return {
      text: `'${stats.alarmType}' 알람은 ${scopeLabel} 최근 ${windowDays}일 라벨 ${stats.totalLabels}건 중 ${pct(confirmRate)}% 확진 — 높은 신뢰로 구체적 조치를 바로 권고해도 된다.`,
      stats: base,
    };
  }
  return null;
}

export interface PromptGuidanceRow {
  readonly farmId: string | null;
  readonly alarmType: string;
  readonly guidanceText: string;
}

/** 활성 가이던스를 프롬프트 블록으로 (순수 함수 — 테스트 대상). 없으면 null */
export function formatPromptGuidances(rows: readonly PromptGuidanceRow[]): string | null {
  if (rows.length === 0) return null;
  const lines = rows.map((r) => `- ${r.guidanceText}`);
  return [
    '## AI 자기보정 가이드 (실측 라벨 기반 — Intelligence Loop 자동 생성)',
    ...lines,
  ].join('\n');
}

interface AggRow {
  readonly farmId: string | null;
  readonly alarmType: string;
  readonly totalLabels: number;
  readonly confirmed: number;
  readonly falsePositive: number;
  readonly modified: number;
}

async function aggregateLabels(windowDays: number): Promise<AggRow[]> {
  const db = getDb();
  const since = new Date(Date.now() - windowDays * 86_400_000);

  // 농장별 집계
  const perFarm = await db
    .select({
      farmId: sovereignAlarmLabels.farmId,
      alarmType: sovereignAlarmLabels.alarmType,
      totalLabels: sql<number>`count(*)::int`,
      confirmed: sql<number>`count(*) filter (where ${sovereignAlarmLabels.verdict} = 'confirmed')::int`,
      falsePositive: sql<number>`count(*) filter (where ${sovereignAlarmLabels.verdict} = 'false_positive')::int`,
      modified: sql<number>`count(*) filter (where ${sovereignAlarmLabels.verdict} = 'modified')::int`,
    })
    .from(sovereignAlarmLabels)
    .where(gte(sovereignAlarmLabels.labeledAt, since))
    .groupBy(sovereignAlarmLabels.farmId, sovereignAlarmLabels.alarmType);

  // 글로벌 집계 (farmId null)
  const global = await db
    .select({
      alarmType: sovereignAlarmLabels.alarmType,
      totalLabels: sql<number>`count(*)::int`,
      confirmed: sql<number>`count(*) filter (where ${sovereignAlarmLabels.verdict} = 'confirmed')::int`,
      falsePositive: sql<number>`count(*) filter (where ${sovereignAlarmLabels.verdict} = 'false_positive')::int`,
      modified: sql<number>`count(*) filter (where ${sovereignAlarmLabels.verdict} = 'modified')::int`,
    })
    .from(sovereignAlarmLabels)
    .where(gte(sovereignAlarmLabels.labeledAt, since))
    .groupBy(sovereignAlarmLabels.alarmType);

  return [
    ...perFarm.map((r) => ({ ...r, farmId: r.farmId as string | null })),
    ...global.map((r) => ({ ...r, farmId: null as string | null })),
  ];
}

export interface PromptImprovementResult {
  readonly aggregates: number;
  readonly upserted: number;
  readonly deactivated: number;
}

/**
 * 프롬프트 개선 배치 — 라벨 집계 → 가이던스 upsert, 기준 미달 기존 가이던스는 비활성화.
 * intelligence-loop 24h 배치에서 호출.
 */
export async function runPromptImprovement(
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<PromptImprovementResult> {
  const db = getDb();
  const aggregates = await aggregateLabels(windowDays);

  let upserted = 0;
  const qualifyingKeys = new Set<string>();

  for (const agg of aggregates) {
    const guidance = buildGuidance(
      {
        alarmType: agg.alarmType,
        totalLabels: agg.totalLabels,
        confirmed: agg.confirmed,
        falsePositive: agg.falsePositive,
        modified: agg.modified,
      },
      agg.farmId ? 'farm' : 'global',
      windowDays,
    );
    if (!guidance) continue;
    qualifyingKeys.add(`${agg.farmId ?? 'global'}:${agg.alarmType}`);

    // 부분 유니크 인덱스(농장/글로벌 분리) 때문에 select → update/insert 수동 upsert
    const scopeCondition = agg.farmId
      ? and(eq(promptGuidances.farmId, agg.farmId), eq(promptGuidances.alarmType, agg.alarmType))
      : and(isNull(promptGuidances.farmId), eq(promptGuidances.alarmType, agg.alarmType));
    const [existing] = await db.select({ guidanceId: promptGuidances.guidanceId })
      .from(promptGuidances).where(scopeCondition).limit(1);

    if (existing) {
      await db.update(promptGuidances)
        .set({ guidanceText: guidance.text, sourceStats: guidance.stats, active: true, updatedAt: new Date() })
        .where(eq(promptGuidances.guidanceId, existing.guidanceId));
    } else {
      await db.insert(promptGuidances).values({
        farmId: agg.farmId,
        alarmType: agg.alarmType,
        guidanceText: guidance.text,
        sourceStats: guidance.stats,
        active: true,
      });
    }
    upserted += 1;
  }

  // 이번 집계에서 기준 미달이 된 기존 활성 가이던스 비활성화 (스테일 가이드 방지)
  const activeRows = await db
    .select({ guidanceId: promptGuidances.guidanceId, farmId: promptGuidances.farmId, alarmType: promptGuidances.alarmType })
    .from(promptGuidances)
    .where(eq(promptGuidances.active, true));
  let deactivated = 0;
  for (const row of activeRows) {
    const key = `${row.farmId ?? 'global'}:${row.alarmType}`;
    if (!qualifyingKeys.has(key)) {
      await db.update(promptGuidances)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(promptGuidances.guidanceId, row.guidanceId));
      deactivated += 1;
    }
  }

  logger.info({ aggregates: aggregates.length, upserted, deactivated }, '[PromptImprover] 프롬프트 개선 배치 완료');
  return { aggregates: aggregates.length, upserted, deactivated };
}

/** 대화 주입용 활성 가이던스 — 농장 특화 우선, 남는 슬롯에 글로벌 */
export async function getActivePromptGuidances(farmId: string): Promise<PromptGuidanceRow[]> {
  const db = getDb();
  const farmRows = await db
    .select({ farmId: promptGuidances.farmId, alarmType: promptGuidances.alarmType, guidanceText: promptGuidances.guidanceText })
    .from(promptGuidances)
    .where(and(eq(promptGuidances.active, true), eq(promptGuidances.farmId, farmId)))
    .limit(MAX_INJECTED_GUIDANCES);
  if (farmRows.length >= MAX_INJECTED_GUIDANCES) return farmRows;

  const covered = new Set(farmRows.map((r) => r.alarmType));
  const globalRows = await db
    .select({ farmId: promptGuidances.farmId, alarmType: promptGuidances.alarmType, guidanceText: promptGuidances.guidanceText })
    .from(promptGuidances)
    .where(and(eq(promptGuidances.active, true), isNull(promptGuidances.farmId)))
    .limit(MAX_INJECTED_GUIDANCES);
  // 농장 특화 가이던스가 있는 알람유형은 글로벌을 중복 주입하지 않음
  const filler = globalRows.filter((g) => !covered.has(g.alarmType))
    .slice(0, MAX_INJECTED_GUIDANCES - farmRows.length);
  return [...farmRows, ...filler];
}
