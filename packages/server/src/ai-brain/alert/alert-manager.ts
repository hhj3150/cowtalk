// 알림 매니저 — Claude 해석 결과에서 알림 생성
// 우선순위, 중복 방지(쿨다운), DB 저장

import type {
  Severity, AnimalInterpretation, FarmInterpretation,
  AlertCandidate,
} from '@cowtalk/shared';
import { ALERT_COOLDOWN_HOURS, URGENCY_HOURS } from '@cowtalk/shared';
import { logger } from '../../lib/logger.js';

// 인메모리 쿨다운 캐시 (운영 시 Redis로 교체)
const cooldownCache = new Map<string, number>();

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
    const lastSent = cooldownCache.get(alert.dedupKey);
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
  cooldownCache.set(alert.dedupKey, Date.now());
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
