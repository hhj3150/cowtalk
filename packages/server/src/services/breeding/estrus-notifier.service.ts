// 발정 알림 서비스 — smaXtec 발정 감지 → 수정사 푸시 알림
// "○○목장 423번 — 수정적기 내일 06시, 추천정액 KPN1234"

import { logger } from '../../lib/logger.js';
import { sendPushToFarm } from '../../realtime/push-service.js';
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

    return sentCount;
  } catch (err) {
    logger.error({ err, animalId: advice.animalId }, '[EstrusNotifier] 알림 발송 실패');
    return 0;
  }
}
