// 발정 알림 서비스 — smaXtec 발정 감지 → 수정사 푸시 알림
// "○○목장 423번 — 수정적기 내일 06시, 추천정액 KPN1234"

import { logger } from '../../lib/logger.js';
import { sendPushToFarm } from '../../realtime/push-service.js';
import { getIO } from '../../realtime/socket-server.js';
import { getDb } from '../../config/database.js';
import { alerts } from '../../db/schema.js';
import type { BreedingAdvice } from './breeding-advisor.service.js';

/**
 * 발정 감지 시 수정사에게 알림 발송
 * storage.ts의 triggerBreedingAdvice()에서 advice 생성 후 호출
 */
export async function notifyInseminatorOnEstrus(
  advice: BreedingAdvice,
): Promise<number> {
  const topSemen = advice.recommendations[0];
  const optimalDate = new Date(advice.optimalInseminationTime);
  const timeStr = optimalDate.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const title = `🔴 발정 감지 — #${advice.earTag}`;
  const bodyParts = [
    `${advice.farmName}`,
    `수정적기: ${timeStr}`,
    advice.optimalTimeLabel,
  ];

  if (topSemen) {
    bodyParts.push(`추천정액: ${topSemen.bullName} (${topSemen.score}점)`);
  }

  if (advice.warnings.length > 0) {
    bodyParts.push(`⚠️ 주의사항 ${advice.warnings.length}건`);
  }

  const body = bodyParts.join(' · ');

  try {
    const sentCount = await sendPushToFarm(advice.farmId, {
      title,
      body,
      severity: 'high',
      url: `/cow/${advice.animalId}`,
    });

    logger.info({
      animalId: advice.animalId,
      earTag: advice.earTag,
      farmId: advice.farmId,
      sentCount,
    }, `[EstrusNotifier] 발정 알림 발송: ${advice.earTag} → ${sentCount}명`);

    // 인앱 알림 — alerts 테이블 삽입 + Socket.IO emit
    await insertEstrusAlert(advice, title, body);

    return sentCount;
  } catch (err) {
    logger.error({ err, animalId: advice.animalId }, '[EstrusNotifier] 알림 발송 실패');
    return 0;
  }
}

// alerts 테이블에 발정 알림 저장 + Socket.IO 실시간 전송
async function insertEstrusAlert(
  advice: BreedingAdvice,
  title: string,
  body: string,
): Promise<void> {
  const topSemen = advice.recommendations[0];
  const actionParts = [`수정 적기: ${advice.optimalTimeLabel}`];
  if (topSemen) actionParts.push(`추천정액: ${topSemen.bullName}`);
  if (advice.warnings.length > 0) actionParts.push(`주의: ${advice.warnings.join(', ')}`);

  const dedupKey = `estrus-${advice.animalId}-${new Date().toISOString().split('T')[0]}`;

  try {
    const db = getDb();
    const [inserted] = await db.insert(alerts).values({
      alertType: 'breeding_estrus',
      animalId: advice.animalId,
      farmId: advice.farmId,
      priority: 'high',
      status: 'new',
      title,
      explanation: body,
      recommendedAction: actionParts.join(' · '),
      dedupKey,
    }).onConflictDoNothing().returning({ alertId: alerts.alertId });

    if (inserted) {
      const io = getIO();
      if (io) {
        io.to(`farm:${advice.farmId}`).emit('alert:new', {
          alertId: inserted.alertId,
          alertType: 'breeding_estrus',
          title,
          body,
          priority: 'high',
          animalId: advice.animalId,
          farmId: advice.farmId,
          url: `/cow/${advice.animalId}`,
        });
      }
      logger.info({ alertId: inserted.alertId, earTag: advice.earTag }, '[EstrusNotifier] 인앱 알림 저장 완료');
    }
  } catch (err) {
    // 인앱 알림 실패는 치명적이지 않으므로 warn 레벨
    logger.warn({ err, animalId: advice.animalId }, '[EstrusNotifier] 인앱 알림 저장 실패');
  }
}
