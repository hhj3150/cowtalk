// 레이블 컨텍스트 — AI 해석에 과거 수의사 진단 레이블을 반영
// 핵심: "과거 유사 패턴에서 수의사들이 확인한 진단" 정보를 Claude에 전달

import { getDb } from '../config/database.js';
import { eventLabels, smaxtecEvents } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';

export interface LabelSummary {
  readonly totalLabels: number;
  readonly diagnosisCounts: readonly { diagnosis: string; count: number; percentage: number }[];
  readonly recentLabels: readonly {
    diagnosis: string;
    verdict: string;
    actionTaken: string | null;
    labeledAt: string;
  }[];
}

/**
 * 특정 이벤트 타입에 대한 과거 레이블 요약을 반환
 * AI 프롬프트에 삽입하여 "집단지성" 효과를 제공
 */
export async function getLabelContextForEventType(
  eventType: string,
  farmId?: string | null,
): Promise<LabelSummary | null> {
  try {
    const db = getDb();

    // 해당 이벤트 타입에 대한 모든 레이블 조회
    const labels = await db.select({
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

    if (labels.length === 0) return null;

    // 진단별 집계
    const diagMap = new Map<string, number>();
    for (const l of labels) {
      const diag = l.diagnosis ?? '미입력';
      diagMap.set(diag, (diagMap.get(diag) ?? 0) + 1);
    }

    const total = labels.length;
    const diagnosisCounts = Array.from(diagMap.entries())
      .map(([diagnosis, count]) => ({
        diagnosis,
        count,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    const recentLabels = labels.slice(0, 5).map((l) => ({
      diagnosis: l.diagnosis ?? '미입력',
      verdict: l.verdict,
      actionTaken: l.actionTaken,
      labeledAt: l.labeledAt?.toISOString() ?? '',
    }));

    return { totalLabels: total, diagnosisCounts, recentLabels };
  } catch {
    return null;
  }
}

/**
 * 레이블 요약을 프롬프트 텍스트로 변환
 */
export function formatLabelContext(summary: LabelSummary, eventType: string): string {
  const lines: string[] = [
    `\n### 📊 소버린 AI 집단지성 — 과거 수의사 진단 레이블 (${eventType})`,
    `총 ${String(summary.totalLabels)}건의 수의사 확인 진단이 축적되어 있습니다:`,
  ];

  for (const d of summary.diagnosisCounts.slice(0, 5)) {
    const bar = '█'.repeat(Math.max(1, Math.round(d.percentage / 10)));
    lines.push(`- **${d.diagnosis}**: ${String(d.count)}건 (${String(d.percentage)}%) ${bar}`);
  }

  if (summary.recentLabels.length > 0) {
    lines.push(`\n최근 진단 사례:`);
    for (const l of summary.recentLabels.slice(0, 3)) {
      const action = l.actionTaken ? ` → ${l.actionTaken}` : '';
      lines.push(`- ${l.diagnosis} (${l.verdict})${action}`);
    }
  }

  lines.push(`\n→ 위 집단지성 데이터를 참고하여 감별진단 우선순위를 조정하세요.`);
  lines.push(`→ "과거 유사 패턴에서 수의사들이 확인한 진단" 정보로 답변 근거를 강화하세요.`);

  return lines.join('\n');
}
