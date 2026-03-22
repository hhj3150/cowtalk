// 전염병 경보 에스컬레이션
// watch → warning → outbreak 단계별 알림 대상 확대

import type { EpidemicAlertLevel, EpidemicWarning, Severity } from '@cowtalk/shared';
import { ESCALATION_TARGETS } from '@cowtalk/shared/constants';
import { logger } from '../../lib/logger.js';

// ======================================================================
// 에스컬레이션 대상 결정
// ======================================================================

export interface EscalationTarget {
  readonly role: string;
  readonly urgency: Severity;
  readonly channels: readonly NotificationChannel[];
}

type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push';

/**
 * 경보 레벨에 따라 에스컬레이션 대상을 결정한다.
 *
 * - watch: farmer + veterinarian (in_app)
 * - warning: + quarantine_officer (in_app + email)
 * - outbreak: + government_admin (in_app + email + sms)
 */
export function getEscalationTargets(
  level: EpidemicAlertLevel,
): readonly EscalationTarget[] {
  if (level === 'normal') return [];

  const roles = ESCALATION_TARGETS[level] ?? ESCALATION_TARGETS.watch;
  return roles.map((role) => ({
    role,
    urgency: mapLevelToUrgency(level),
    channels: getChannelsForLevel(level, role),
  }));
}

/**
 * 에스컬레이션 실행
 *
 * 실제 알림 발송은 notification 모듈에 위임한다.
 * 여기서는 에스컬레이션 대상 결정 + 로깅만 담당한다.
 */
export function buildEscalationPlan(
  warning: EpidemicWarning,
): EscalationPlan {
  const targets = getEscalationTargets(warning.level);

  const plan: EscalationPlan = {
    warningId: warning.warningId,
    clusterId: warning.clusterId,
    level: warning.level,
    targets,
    message: buildEscalationMessage(warning),
    createdAt: new Date(),
  };

  logger.info(
    {
      warningId: warning.warningId,
      level: warning.level,
      targetCount: targets.length,
      roles: targets.map((t) => t.role),
    },
    'Epidemic escalation plan created',
  );

  return plan;
}

/**
 * 에스컬레이션 레벨이 상승해야 하는지 판단
 */
export function shouldEscalate(
  currentLevel: EpidemicAlertLevel,
  newLevel: EpidemicAlertLevel,
): boolean {
  const order: Record<EpidemicAlertLevel, number> = {
    normal: 0,
    watch: 1,
    warning: 2,
    outbreak: 3,
  };
  return order[newLevel] > order[currentLevel];
}

// ======================================================================
// 타입
// ======================================================================

export interface EscalationPlan {
  readonly warningId: string;
  readonly clusterId: string;
  readonly level: EpidemicAlertLevel;
  readonly targets: readonly EscalationTarget[];
  readonly message: EscalationMessage;
  readonly createdAt: Date;
}

export interface EscalationMessage {
  readonly title: string;
  readonly body: string;
  readonly severity: Severity;
  readonly actionRequired: string;
}

// ======================================================================
// 내부 함수
// ======================================================================

function mapLevelToUrgency(level: EpidemicAlertLevel): Severity {
  const mapping: Record<EpidemicAlertLevel, Severity> = {
    normal: 'low',
    watch: 'medium',
    warning: 'high',
    outbreak: 'critical',
  };
  return mapping[level];
}

function getChannelsForLevel(
  level: EpidemicAlertLevel,
  role: string,
): readonly NotificationChannel[] {
  switch (level) {
    case 'outbreak':
      return ['in_app', 'email', 'sms', 'push'];
    case 'warning':
      if (role === 'quarantine_officer' || role === 'government_admin') {
        return ['in_app', 'email', 'sms'];
      }
      return ['in_app', 'email'];
    case 'watch':
      return ['in_app'];
    default:
      return [];
  }
}

function buildEscalationMessage(warning: EpidemicWarning): EscalationMessage {
  const levelLabels: Record<EpidemicAlertLevel, string> = {
    normal: '정상',
    watch: '주의',
    warning: '경고',
    outbreak: '발병',
  };

  const levelLabel = levelLabels[warning.level] ?? '알 수 없음';

  const titleMap: Record<EpidemicAlertLevel, string> = {
    normal: '',
    watch: `[주의] 질병 클러스터 감지`,
    warning: `[경고] 전염병 확산 위험`,
    outbreak: `[긴급] 전염병 발병 경보`,
  };

  const actionMap: Record<EpidemicAlertLevel, string> = {
    normal: '',
    watch: '영향 농장 모니터링을 강화하세요.',
    warning: '방역 조치를 즉시 시행하고 인접 농장에 통보하세요.',
    outbreak: '긴급 방역 체계를 가동하고 이동 제한을 검토하세요.',
  };

  return {
    title: titleMap[warning.level] ?? `[${levelLabel}] 전염병 경보`,
    body: warning.aiInterpretation
      ? (warning.aiInterpretation as { riskAssessment?: string }).riskAssessment ?? `${levelLabel} 수준의 전염병 경보가 발령되었습니다.`
      : `${levelLabel} 수준의 전염병 경보가 발령되었습니다.`,
    severity: mapLevelToUrgency(warning.level),
    actionRequired: actionMap[warning.level] ?? '',
  };
}
