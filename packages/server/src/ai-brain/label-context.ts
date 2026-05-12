// 레이블 컨텍스트 — AI 해석에 과거 수의사 진단 레이블을 반영
// 핵심: "과거 유사 패턴에서 수의사들이 확인한 진단" 정보를 Claude에 전달
//
// 계층 집계 (지역별 자가 진화 AI):
//   [이 농장] → [이 시도] → [한국 전체] → [전 세계]
// 데이터가 쌓일수록 그 농장·그 지역에 특화된 답변이 나옴.
// 경기도에서 쓰면 경기도 패턴, 우즈벡에서 쓰면 우즈벡 패턴이 우선 반영됨.

import { getDb } from '../config/database.js';
import { eventLabels, smaxtecEvents, farms, regions } from '../db/schema.js';
import { eq, desc, and, inArray, sql } from 'drizzle-orm';

export interface LabelSummary {
  readonly totalLabels: number;
  readonly diagnosisCounts: readonly { diagnosis: string; count: number; percentage: number }[];
  readonly recentLabels: readonly {
    diagnosis: string;
    verdict: string;
    actionTaken: string | null;
    labeledAt: string;
  }[];
  /** 데이터 출처 단계 — farm/region/country/global */
  readonly scope: 'farm' | 'region' | 'country' | 'global';
  /** 사람이 읽을 수 있는 출처 라벨 (예: "갈전리목장", "경기도", "한국 전체") */
  readonly scopeLabel: string;
}

export interface HierarchicalLabelContext {
  readonly farm?: LabelSummary;
  readonly region?: LabelSummary;
  readonly country?: LabelSummary;
  readonly global?: LabelSummary;
}

type LabelRow = {
  diagnosis: string | null;
  verdict: string;
  actionTaken: string | null;
  labeledAt: Date | null;
};

function aggregateLabels(
  rows: readonly LabelRow[],
  scope: LabelSummary['scope'],
  scopeLabel: string,
): LabelSummary | null {
  if (rows.length === 0) return null;
  const diagMap = new Map<string, number>();
  for (const l of rows) {
    const diag = l.diagnosis ?? '미입력';
    diagMap.set(diag, (diagMap.get(diag) ?? 0) + 1);
  }
  const total = rows.length;
  const diagnosisCounts = Array.from(diagMap.entries())
    .map(([diagnosis, count]) => ({
      diagnosis,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  const recentLabels = rows.slice(0, 5).map((l) => ({
    diagnosis: l.diagnosis ?? '미입력',
    verdict: l.verdict,
    actionTaken: l.actionTaken,
    labeledAt: l.labeledAt?.toISOString() ?? '',
  }));

  return { totalLabels: total, diagnosisCounts, recentLabels, scope, scopeLabel };
}

/**
 * 특정 이벤트 타입에 대한 과거 레이블 요약을 반환 (단일 스코프 — 후방 호환용).
 * 새 코드는 getHierarchicalLabelContext 를 사용하세요.
 */
export async function getLabelContextForEventType(
  eventType: string,
  farmId?: string | null,
): Promise<LabelSummary | null> {
  try {
    const db = getDb();
    const labels: LabelRow[] = await db.select({
      diagnosis: eventLabels.actualDiagnosis,
      verdict: eventLabels.verdict,
      actionTaken: eventLabels.actionTaken,
      labeledAt: eventLabels.labeledAt,
    })
      .from(eventLabels)
      .innerJoin(smaxtecEvents, eq(eventLabels.eventId, smaxtecEvents.eventId))
      .where(
        farmId
          ? and(eq(smaxtecEvents.eventType, eventType), eq(smaxtecEvents.farmId, farmId))
          : eq(smaxtecEvents.eventType, eventType),
      )
      .orderBy(desc(eventLabels.labeledAt))
      .limit(50);

    return aggregateLabels(labels, farmId ? 'farm' : 'global', farmId ? '이 농장' : '전체');
  } catch {
    return null;
  }
}

/**
 * 계층 집계 — 같은 이벤트 타입의 레이블을 [농장 → 시도 → 국가 → 글로벌] 4단계로 동시 집계.
 *
 * 효과:
 *   - 이 농장에 레이블이 쌓이면 → 농장 전담 패턴 우선
 *   - 농장 데이터가 부족하면 → 같은 시도(예: 경기도) 패턴이 우선
 *   - 시도 데이터도 없으면 → 국가 전체 패턴
 *   - 우즈벡에서 레이블이 쌓이면 자동으로 우즈벡 패턴이 그 사용자에게 우선 적용됨
 *
 * 현재 데이터 모델(regions 테이블)은 한국 시·군·도 기반이라 국가 분류가 명시 컬럼은 없음.
 * 시도(province) 단위까지는 정밀, 국가는 "동일 region 그룹 외" 글로벌 fallback으로 처리.
 * 추후 farms.country_code 컬럼 추가 시 4단계 모두 명확히 분리 가능.
 */
export async function getHierarchicalLabelContext(
  eventType: string,
  farmId?: string | null,
): Promise<HierarchicalLabelContext> {
  const db = getDb();
  const result: { farm?: LabelSummary; region?: LabelSummary; country?: LabelSummary; global?: LabelSummary } = {};

  let regionId: string | null = null;
  let provinceName: string | null = null;
  if (farmId) {
    try {
      const farmRow = await db.select({
        regionId: farms.regionId,
        province: regions.province,
      })
        .from(farms)
        .leftJoin(regions, eq(farms.regionId, regions.regionId))
        .where(eq(farms.farmId, farmId))
        .limit(1);
      regionId = farmRow[0]?.regionId ?? null;
      provinceName = farmRow[0]?.province ?? null;
    } catch {
      // 농장 조회 실패는 비치명적
    }
  }

  // 4단계 병렬 조회
  const [farmRows, regionRows, globalRows] = await Promise.all([
    // 농장
    farmId
      ? db.select({
          diagnosis: eventLabels.actualDiagnosis,
          verdict: eventLabels.verdict,
          actionTaken: eventLabels.actionTaken,
          labeledAt: eventLabels.labeledAt,
        })
          .from(eventLabels)
          .innerJoin(smaxtecEvents, eq(eventLabels.eventId, smaxtecEvents.eventId))
          .where(and(eq(smaxtecEvents.eventType, eventType), eq(smaxtecEvents.farmId, farmId)))
          .orderBy(desc(eventLabels.labeledAt))
          .limit(30)
          .catch(() => [] as LabelRow[])
      : Promise.resolve([] as LabelRow[]),

    // 시도 (province)
    regionId
      ? db.select({
          diagnosis: eventLabels.actualDiagnosis,
          verdict: eventLabels.verdict,
          actionTaken: eventLabels.actionTaken,
          labeledAt: eventLabels.labeledAt,
        })
          .from(eventLabels)
          .innerJoin(smaxtecEvents, eq(eventLabels.eventId, smaxtecEvents.eventId))
          .innerJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
          .innerJoin(regions, eq(farms.regionId, regions.regionId))
          .where(and(
            eq(smaxtecEvents.eventType, eventType),
            sql`${regions.province} = (SELECT r.province FROM regions r JOIN farms f ON f.region_id = r.region_id WHERE f.farm_id = ${farmId})`,
          ))
          .orderBy(desc(eventLabels.labeledAt))
          .limit(50)
          .catch(() => [] as LabelRow[])
      : Promise.resolve([] as LabelRow[]),

    // 글로벌
    db.select({
      diagnosis: eventLabels.actualDiagnosis,
      verdict: eventLabels.verdict,
      actionTaken: eventLabels.actionTaken,
      labeledAt: eventLabels.labeledAt,
    })
      .from(eventLabels)
      .innerJoin(smaxtecEvents, eq(eventLabels.eventId, smaxtecEvents.eventId))
      .where(eq(smaxtecEvents.eventType, eventType))
      .orderBy(desc(eventLabels.labeledAt))
      .limit(100)
      .catch(() => [] as LabelRow[]),
  ]);

  if (farmId && farmRows.length > 0) {
    result.farm = aggregateLabels(farmRows, 'farm', '이 농장') ?? undefined;
  }
  if (regionId && regionRows.length > 0) {
    result.region = aggregateLabels(regionRows, 'region', provinceName ?? '이 시도') ?? undefined;
  }
  if (globalRows.length > 0) {
    result.country = aggregateLabels(globalRows, 'country', '한국 전체') ?? undefined;
    // 현재 country = global (regions가 한국만). 추후 country_code 추가 시 분리.
  }
  void inArray; // 향후 country 단위 별도 조회용 import 보존

  return result;
}

/**
 * 단일 스코프 레이블 요약을 프롬프트 텍스트로 변환 (후방 호환).
 */
export function formatLabelContext(summary: LabelSummary, eventType: string): string {
  const lines: string[] = [
    `\n### 소버린 AI 집단지성 — 과거 수의사 진단 레이블 (${eventType}, 출처: ${summary.scopeLabel})`,
    `${summary.scopeLabel}에서 총 ${String(summary.totalLabels)}건의 수의사 확인 진단이 축적되어 있습니다.`,
  ];

  for (const d of summary.diagnosisCounts.slice(0, 5)) {
    lines.push(`- ${d.diagnosis}: ${String(d.count)}건 (${String(d.percentage)}%)`);
  }

  if (summary.recentLabels.length > 0) {
    lines.push(`\n최근 진단 사례:`);
    for (const l of summary.recentLabels.slice(0, 3)) {
      const action = l.actionTaken ? ` → ${l.actionTaken}` : '';
      lines.push(`- ${l.diagnosis} (${l.verdict})${action}`);
    }
  }

  lines.push(`\n→ 위 ${summary.scopeLabel} 패턴을 우선 근거로 감별진단을 조정하세요.`);

  return lines.join('\n');
}

/**
 * 계층 레이블 컨텍스트를 프롬프트 텍스트로 변환.
 *
 * 출력 패턴:
 *   "이 농장 — 유방염 80% (8/10)"   ← 농장에 데이터 있으면 가장 강한 근거
 *   "이 시도 — 유방염 60% (45/75)"  ← 같은 시도(예: 경기도) 보정
 *   "한국 전체 — 유방염 50% (200/400)"  ← 국가 기준 (현재 한국만)
 *
 * AI는 더 좁은 스코프(농장>시도>국가)를 우선 근거로 사용하도록 지시받음.
 */
export function formatHierarchicalLabelContext(
  ctx: HierarchicalLabelContext,
  eventType: string,
): string | null {
  const sections: string[] = [];

  const addSection = (sum: LabelSummary | undefined): void => {
    if (!sum) return;
    const top = sum.diagnosisCounts
      .slice(0, 3)
      .map((d) => `${d.diagnosis} ${String(d.percentage)}% (${String(d.count)}건)`)
      .join(', ');
    sections.push(`- **${sum.scopeLabel}** (${String(sum.totalLabels)}건): ${top}`);
  };

  addSection(ctx.farm);
  addSection(ctx.region);
  addSection(ctx.country);
  // global은 country와 동일해서 중복 방지 (regions가 한국만)

  if (sections.length === 0) return null;

  const lines: string[] = [
    `\n### 소버린 AI 계층 집단지성 — ${eventType}`,
    `좁은 스코프일수록 답변 근거로 우선 사용 (이 농장 > 이 시도 > 국가):`,
    ...sections,
  ];

  // 최근 사례는 가장 좁은 스코프(농장 우선)에서 가져옴
  const recentSource = ctx.farm ?? ctx.region ?? ctx.country;
  if (recentSource && recentSource.recentLabels.length > 0) {
    lines.push(`\n${recentSource.scopeLabel} 최근 진단 사례:`);
    for (const l of recentSource.recentLabels.slice(0, 3)) {
      const action = l.actionTaken ? ` → ${l.actionTaken}` : '';
      lines.push(`- ${l.diagnosis} (${l.verdict})${action}`);
    }
  }

  lines.push(`\n→ 가장 좁은 스코프의 패턴을 1순위 근거로 사용하고, 데이터가 없거나 부족하면 상위 스코프로 보정하세요.`);
  lines.push(`→ 이 지역에 누적된 진단 패턴이 사용자가 사는 환경에 가장 맞는 답입니다.`);

  return lines.join('\n');
}
