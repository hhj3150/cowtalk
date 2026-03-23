// 다단계 자동 경보 전파 서비스
// Level 1 → 농장주+수의사
// Level 2 → +방역관
// Level 3 → +시군 방역담당+관리자
// 집단 발열(3두+) → 즉시 Level 3 격상
// 미확인 2시간 → 자동 격상

import { emitNewAlarm } from '../../realtime/alarm-emitter.js';
import { sendPushToFarm } from '../../realtime/push-service.js';
import { logger } from '../../lib/logger.js';
import type { TempAlertLevel } from './temperature-profile.service.js';
import type { ClusterSeverity } from './farm-cluster.service.js';
import type { LegalDiseaseCode } from './disease-signature.db.js';
import { randomUUID } from 'crypto';

// ===========================
// 타입
// ===========================

export interface CascadeAlert {
  readonly alertId: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly animalId?: string;
  readonly earTag?: string;
  readonly level: TempAlertLevel | 'cluster' | 'legal_disease';
  readonly effectiveLevel: 1 | 2 | 3;  // 격상 후 실제 레벨
  readonly dsi?: number;
  readonly clusterSeverity?: ClusterSeverity;
  readonly suspectedDisease?: LegalDiseaseCode;
  readonly diseaseSimilarity?: number;
  readonly message: string;
  readonly recipients: readonly Recipient[];
  readonly channels: readonly Channel[];
  readonly triggeredAt: string;
  readonly acknowledgeDeadline: string;  // 2시간 후 자동 격상
}

interface Recipient {
  readonly role: string;
  readonly userId?: string;
}

type Channel = 'websocket' | 'push' | 'kakao' | 'sms';

// ===========================
// 레벨별 수신자 + 채널
// ===========================

const LEVEL_CONFIG: Record<1 | 2 | 3, { recipients: readonly string[]; channels: readonly Channel[] }> = {
  1: {
    recipients: ['farm_owner', 'veterinarian'],
    channels: ['websocket', 'push'],
  },
  2: {
    recipients: ['farm_owner', 'veterinarian', 'quarantine_officer'],
    channels: ['websocket', 'push', 'kakao'],
  },
  3: {
    recipients: ['farm_owner', 'veterinarian', 'quarantine_officer', 'district_animal_health', 'government_admin'],
    channels: ['websocket', 'push', 'kakao', 'sms'],
  },
} as const;

// ===========================
// 실제 메시지 전송
// ===========================

async function sendChannels(
  alert: CascadeAlert,
  channels: readonly Channel[],
): Promise<void> {
  const alarmPayload = {
    eventId: alert.alertId,
    eventType: `fever_level_${alert.effectiveLevel}`,
    farmId: alert.farmId,
    farmName: alert.farmName,
    animalId: alert.animalId,
    earTag: alert.earTag,
    severity: alert.effectiveLevel === 3 ? 'critical' : alert.effectiveLevel === 2 ? 'high' : 'medium',
    confidence: 0.85,
    detectedAt: alert.triggeredAt,
    details: {
      level: alert.effectiveLevel,
      dsi: alert.dsi,
      message: alert.message,
      suspectedDisease: alert.suspectedDisease,
    },
  };

  for (const channel of channels) {
    try {
      if (channel === 'websocket') {
        emitNewAlarm(alarmPayload);
      } else if (channel === 'push') {
        await sendPushToFarm(alert.farmId, {
          title: `🌡️ 발열 경보 Level ${alert.effectiveLevel}`,
          body: alert.message,
          severity: alert.effectiveLevel === 3 ? 'critical' : alert.effectiveLevel === 2 ? 'high' : 'medium',
          farmId: alert.farmId,
          url: `/early-detection`,
        });
      } else if (channel === 'kakao') {
        // 카카오 알림톡 — 실제 환경에서 카카오 비즈메시지 API 연동
        logger.info(
          { alertId: alert.alertId, farmId: alert.farmId },
          '[Cascade] KakaoTalk alert queued (stub)',
        );
      } else if (channel === 'sms') {
        // SMS — 실제 환경에서 NCP SMS API 연동
        logger.info(
          { alertId: alert.alertId, farmId: alert.farmId },
          '[Cascade] SMS alert queued (stub)',
        );
      }
    } catch (err) {
      logger.error({ err, channel, alertId: alert.alertId }, '[Cascade] Channel send failed');
    }
  }
}

// ===========================
// 개체 발열 경보 발송
// ===========================

export async function triggerFeverAlert(params: {
  farmId: string;
  farmName: string;
  animalId: string;
  earTag: string;
  level: TempAlertLevel;
  currentTemp: number;
  dsi?: number;
  suspectedDisease?: LegalDiseaseCode;
  diseaseSimilarity?: number;
}): Promise<CascadeAlert> {
  // 법정전염병 의심 or DSI 매우 높음 → Level 3 격상
  let effectiveLevel: 1 | 2 | 3 = params.level;
  if (params.diseaseSimilarity && params.diseaseSimilarity >= 50) {
    effectiveLevel = 3;
  } else if (params.dsi && params.dsi >= 70 && effectiveLevel < 2) {
    effectiveLevel = 2;
  }

  const config = LEVEL_CONFIG[effectiveLevel];

  const messages: Record<1 | 2 | 3, string> = {
    1: `${params.earTag} 이표 개체 체온 주의 (${params.currentTemp.toFixed(1)}°C) — 관찰 필요`,
    2: `${params.earTag} 이표 개체 발열 경보 (${params.currentTemp.toFixed(1)}°C) — 수의사 점검 권고`,
    3: `🚨 ${params.earTag} 이표 개체 고열 위험 (${params.currentTemp.toFixed(1)}°C) — 즉시 격리 및 방역 조치`,
  };

  const now = new Date();
  const deadline = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const alert: CascadeAlert = {
    alertId: randomUUID(),
    farmId: params.farmId,
    farmName: params.farmName,
    animalId: params.animalId,
    earTag: params.earTag,
    level: params.level,
    effectiveLevel,
    dsi: params.dsi,
    suspectedDisease: params.suspectedDisease,
    diseaseSimilarity: params.diseaseSimilarity,
    message: messages[effectiveLevel],
    recipients: config.recipients.map((role) => ({ role })),
    channels: config.channels,
    triggeredAt: now.toISOString(),
    acknowledgeDeadline: deadline.toISOString(),
  };

  logger.info(
    { alertId: alert.alertId, farmId: params.farmId, animalId: params.animalId, effectiveLevel },
    '[Cascade] Fever alert triggered',
  );

  await sendChannels(alert, config.channels);
  return alert;
}

// ===========================
// 집단 발열 경보 발송
// ===========================

export async function triggerClusterAlert(params: {
  farmId: string;
  farmName: string;
  feverCount: number;
  clusterSeverity: ClusterSeverity;
  suspectedDisease?: LegalDiseaseCode;
}): Promise<CascadeAlert> {
  // 집단 발열 → 항상 Level 3
  const effectiveLevel: 1 | 2 | 3 = 3;
  const config = LEVEL_CONFIG[effectiveLevel];

  const message = params.clusterSeverity === 'outbreak'
    ? `🚨 집단 발병 의심: ${params.feverCount}두 고열 감지 — 즉시 방역관 신고 및 이동 제한`
    : `⚠️ 집단 발열 감지: ${params.feverCount}두 발열 — 농장 격리 및 역학 조사 필요`;

  const now = new Date();
  const deadline = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const alert: CascadeAlert = {
    alertId: randomUUID(),
    farmId: params.farmId,
    farmName: params.farmName,
    level: 'cluster',
    effectiveLevel,
    clusterSeverity: params.clusterSeverity,
    suspectedDisease: params.suspectedDisease,
    message,
    recipients: config.recipients.map((role) => ({ role })),
    channels: config.channels,
    triggeredAt: now.toISOString(),
    acknowledgeDeadline: deadline.toISOString(),
  };

  logger.warn(
    { alertId: alert.alertId, farmId: params.farmId, feverCount: params.feverCount },
    '[Cascade] Cluster alert triggered',
  );

  await sendChannels(alert, config.channels);
  return alert;
}

// ===========================
// 법정전염병 의심 경보
// ===========================

export async function triggerLegalDiseaseAlert(params: {
  farmId: string;
  farmName: string;
  animalId: string;
  earTag: string;
  diseaseCode: LegalDiseaseCode;
  diseaseNameKr: string;
  similarity: number;
}): Promise<CascadeAlert> {
  const effectiveLevel: 1 | 2 | 3 = 3;
  const config = LEVEL_CONFIG[effectiveLevel];

  const isKahisRequired = params.similarity >= 80;
  const message = isKahisRequired
    ? `🚨 법정전염병 의심(${params.similarity}%): ${params.earTag}이표 개체 ${params.diseaseNameKr} 의심 — KAHIS 신고 준비`
    : `⚠️ 법정전염병 가능성(${params.similarity}%): ${params.earTag}이표 개체 ${params.diseaseNameKr} 유사 증상`;

  const now = new Date();
  const deadline = new Date(now.getTime() + 60 * 60 * 1000);  // 1시간 (더 긴급)

  const alert: CascadeAlert = {
    alertId: randomUUID(),
    farmId: params.farmId,
    farmName: params.farmName,
    animalId: params.animalId,
    earTag: params.earTag,
    level: 'legal_disease',
    effectiveLevel,
    suspectedDisease: params.diseaseCode,
    diseaseSimilarity: params.similarity,
    message,
    recipients: config.recipients.map((role) => ({ role })),
    channels: config.channels,
    triggeredAt: now.toISOString(),
    acknowledgeDeadline: deadline.toISOString(),
  };

  logger.error(
    { alertId: alert.alertId, farmId: params.farmId, diseaseCode: params.diseaseCode, similarity: params.similarity },
    '[Cascade] Legal disease alert triggered',
  );

  await sendChannels(alert, config.channels);
  return alert;
}
