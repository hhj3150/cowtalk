// 알림 매니저 — Claude 해석 결과에서 알림 생성
// 우선순위, 중복 방지(쿨다운), DB 저장

import type {
  Severity, AnimalInterpretation, FarmInterpretation,
  AlertCandidate,
} from '@cowtalk/shared';
import { ALERT_COOLDOWN_HOURS, URGENCY_HOURS } from '@cowtalk/shared';
import { logger } from '../../lib/logger.js';
import { setBounded } from '../../lib/bounded-map.js';
import { getDb } from '../../config/database.js';
import { alerts as alertsTable } from '../../db/schema.js';
import { and, gte, inArray, sql } from 'drizzle-orm';

// 쿨다운 캐시 — 이 프로세스가 보낸 알림. OPS-12: 재시작·다른 레플리카가 보낸 알림은
// primeCooldownFromDb 가 alerts 테이블(dedup_key, created_at)에서 채운다
const cooldownCache = new Map<string, number>();
// OPS-16: 상한 — 넘치면 오래된 키부터 버린다 (버려진 키는 primeCooldownFromDb 가 DB 에서 다시 채운다)
const COOLDOWN_CACHE_MAX = 20_000;
const MAX_COOLDOWN_MS = Math.max(...Object.values(ALERT_COOLDOWN_HOURS), 12) * 60 * 60 * 1000;

/**
 * OPS-12: 쿨다운이 메모리에만 있어 재시작 직후·레플리카마다 같은 알림을 다시 보냈다.
 * 후보 dedupKey 의 최근 발송 시각을 DB 에서 읽어 캐시에 합친다. 실패하면 메모리 캐시만으로 진행.
 */
export async function primeCooldownFromDb(candidates: readonly AlertCandidate[]): Promise<void> {
  const keys = [...new Set(candidates.map((a) => a.dedupKey.slice(0, 200)))];
  if (keys.length === 0) return;
  try {
    const rows = await getDb()
      .select({ dedupKey: alertsTable.dedupKey, lastAt: sql<string>`max(${alertsTable.createdAt})` })
      .from(alertsTable)
      .where(and(inArray(alertsTable.dedupKey, keys), gte(alertsTable.createdAt, new Date(Date.now() - MAX_COOLDOWN_MS))))
      .groupBy(alertsTable.dedupKey);
    mergeCooldown(rows.map((r) => ({ dedupKey: r.dedupKey, lastAt: new Date(r.lastAt).getTime() })));
  } catch (err) {
    logger.warn({ err }, '[Alert] 쿨다운 DB 조회 실패 — 메모리 캐시로 진행');
  }
}

/** 더 최근 시각만 반영 */
export function mergeCooldown(rows: ReadonlyArray<{ dedupKey: string; lastAt: number }>): void {
  for (const r of rows) {
    if (!Number.isFinite(r.lastAt)) continue;
    const cur = cooldownCache.get(r.dedupKey) ?? 0;
    if (r.lastAt > cur) setBounded(cooldownCache, r.dedupKey, r.lastAt, COOLDOWN_CACHE_MAX);
  }
}

export function clearCooldownCacheForTest(): void {
  cooldownCache.clear();
}

// ===========================
// 개체 해석 → 알림 후보 추출
// ===========================

export function extractAlertsFromAnimal(
  interpretation: AnimalInterpretation,
): readonly AlertCandidate[] {
  const alerts: AlertCandidate[] = [];

  if (interpretation.severity === 'critical' || interpretation.severity === 'high') {
    alerts.push({
      type: mapSeverityToAlertType(interpretation),
      animalId: interpretation.animalId,
      farmId: '', // 호출자가 채움
      severity: interpretation.severity,
      message: interpretation.summary,
      source: interpretation.source,
      dedupKey: `animal:${interpretation.animalId}:${interpretation.severity}`,
    });
  }

  return alerts;
}

// ===========================
// 농장 해석 → 알림 후보 추출
// ===========================

export function extractAlertsFromFarm(
  interpretation: FarmInterpretation,
): readonly AlertCandidate[] {
  const alerts: AlertCandidate[] = [];

  // 농장 수준 고위험
  if (interpretation.severity === 'critical' || interpretation.severity === 'high') {
    alerts.push({
      type: 'herd_anomaly',
      animalId: null,
      farmId: interpretation.farmId,
      severity: interpretation.severity,
      message: interpretation.summary,
      source: interpretation.source,
      dedupKey: `farm:${interpretation.farmId}:${interpretation.severity}`,
    });
  }

  // 긴급 개체
  for (const highlight of interpretation.animalHighlights) {
    if (highlight.severity === 'critical' || highlight.severity === 'high') {
      alerts.push({
        type: 'health_risk',
        animalId: highlight.animalId,
        farmId: interpretation.farmId,
        severity: highlight.severity,
        message: `${highlight.earTag}: ${highlight.issue}`,
        source: interpretation.source,
        dedupKey: `animal:${highlight.animalId}:${highlight.severity}`,
      });
    }
  }

  return alerts;
}

// ===========================
// 쿨다운 필터
// ===========================

export function filterByCooldown(
  alerts: readonly AlertCandidate[],
): readonly AlertCandidate[] {
  const now = Date.now();

  return alerts.filter((alert) => {
    const lastSent = cooldownCache.get(alert.dedupKey.slice(0, 200));
    if (lastSent) {
      const cooldownMs = getCooldownMs(alert.type);
      if (now - lastSent < cooldownMs) {
        logger.debug({ dedupKey: alert.dedupKey }, 'Alert suppressed by cooldown');
        return false;
      }
    }
    return true;
  });
}

export function markAlertSent(alert: AlertCandidate): void {
  setBounded(cooldownCache, alert.dedupKey.slice(0, 200), Date.now(), COOLDOWN_CACHE_MAX);
}

// ===========================
// 우선순위 정렬
// ===========================

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function sortByPriority(
  alerts: readonly AlertCandidate[],
): readonly AlertCandidate[] {
  return [...alerts].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

// ===========================
// 긴급도 (시간)
// ===========================

export function getUrgencyHours(severity: Severity): number {
  return URGENCY_HOURS[severity] ?? 24;
}

// ===========================
// 헬퍼
// ===========================

function mapSeverityToAlertType(interpretation: AnimalInterpretation): string {
  const primary = interpretation.interpretation.primary.toLowerCase();
  if (primary.includes('estrus') || primary.includes('발정')) return 'estrus_candidate';
  if (primary.includes('disease') || primary.includes('질병')) return 'health_risk';
  if (primary.includes('pregnancy') || primary.includes('임신')) return 'productivity_drop';
  return 'health_risk';
}

function getCooldownMs(alertType: string): number {
  const hours = ALERT_COOLDOWN_HOURS[alertType] ?? 12;
  return hours * 60 * 60 * 1000;
}
