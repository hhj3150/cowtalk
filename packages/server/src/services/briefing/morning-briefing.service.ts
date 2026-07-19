// 아침 브리핑 — "오늘 볼 소 N마리" 한 줄이 목장주가 매일 앱을 여는 이유가 된다
//
// 파일럿 1단계 핵심: 매일 아침(KST 06시대) 농장별 결정 큐 상위 카드를 요약해
// 목장주 휴대폰으로 카카오 알림톡 발송. 결정 큐가 비면 "이상 없음" 브리핑도 보낸다
// (무소식이 안심이라는 것도 정보다).
//
// 발송 대상: 농장에 배정된 farmer 역할 + 전화번호 보유 사용자. 없으면 farms.phone 폴백.
// 중복 방지: 프로세스 내 날짜 가드 (재시작 시 드물게 중복 가능 — 무해).

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { farms, users, userFarmAccess } from '../../db/schema.js';
import { getDecisionQueue } from '../decision/decision-queue.service.js';
import { sendAlimtalk } from '../../lib/kakao-alimtalk.js';
import { logger } from '../../lib/logger.js';
import { URGENCY_LABELS } from '@cowtalk/shared';
import type { DecisionCard } from '@cowtalk/shared';

/** KST(UTC+9) 기준 현재 시각 정보 */
export function kstNow(now: Date = new Date()): { hour: number; dateStr: string } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return { hour: kst.getUTCHours(), dateStr: kst.toISOString().slice(0, 10) };
}

/** 발송 시간대 판정 (순수) — KST 06:00~07:59 */
export function isBriefingWindow(hour: number): boolean {
  return hour >= 6 && hour < 8;
}

/** 브리핑 본문 라인 구성 (순수) — 카드 최대 3장을 한 줄씩 */
export function buildBriefingLines(cards: readonly DecisionCard[]): string {
  if (cards.length === 0) return '오늘은 긴급 확인 대상이 없습니다. 평소대로 관리하세요.';
  return cards
    .slice(0, 3)
    .map((c, i) => {
      const tag = c.subject.earTag ? `${c.subject.earTag}번` : '농장';
      const urgency = URGENCY_LABELS[c.urgency] ?? '';
      return `${i + 1}. [${urgency}] ${tag} — ${c.title}`;
    })
    .join('\n');
}

// 프로세스 내 발송 가드: 날짜 → 발송 완료 농장 집합
let sentDate = '';
const sentFarms = new Set<string>();

export interface MorningBriefingSummary {
  readonly attempted: number;
  readonly sent: number;
  readonly skippedNoPhone: number;
}

/**
 * 아침 브리핑 실행 — 15분 주기 잡에서 호출되며, KST 06시대에만 실제 발송한다.
 * force=true는 시간대·중복 가드를 무시 (수동 테스트용).
 */
export async function runMorningBriefing(force = false): Promise<MorningBriefingSummary | null> {
  const { hour, dateStr } = kstNow();
  if (!force && !isBriefingWindow(hour)) return null;

  if (sentDate !== dateStr) {
    sentDate = dateStr;
    sentFarms.clear();
  }

  const db = getDb();
  const activeFarms = await db
    .select({ farmId: farms.farmId, name: farms.name, phone: farms.phone })
    .from(farms)
    .where(and(eq(farms.status, 'active'), isNull(farms.deletedAt)));

  const targets = activeFarms.filter((f) => force || !sentFarms.has(f.farmId));
  if (targets.length === 0) return { attempted: 0, sent: 0, skippedNoPhone: 0 };

  // 농장별 farmer 수신자 (전화번호 보유 + 승인된 계정만)
  const access = await db
    .select({ farmId: userFarmAccess.farmId, phone: users.phone })
    .from(userFarmAccess)
    .innerJoin(users, eq(userFarmAccess.userId, users.userId))
    .where(and(
      inArray(userFarmAccess.farmId, targets.map((f) => f.farmId)),
      eq(users.role, 'farmer'),
      eq(users.status, 'active'),
      eq(users.approvalStatus, 'approved'),
    ));
  const phonesByFarm = new Map<string, string[]>();
  for (const a of access) {
    if (!a.phone) continue;
    const list = phonesByFarm.get(a.farmId) ?? [];
    list.push(a.phone);
    phonesByFarm.set(a.farmId, list);
  }

  let attempted = 0;
  let sent = 0;
  let skippedNoPhone = 0;

  for (const farm of targets) {
    const phones = phonesByFarm.get(farm.farmId) ?? (farm.phone ? [farm.phone] : []);
    sentFarms.add(farm.farmId); // 수신자 없어도 오늘은 재시도하지 않음
    if (phones.length === 0) {
      skippedNoPhone++;
      continue;
    }

    try {
      const queue = await getDecisionQueue({ farmId: farm.farmId, role: 'farmer', limit: 3 });
      const lines = buildBriefingLines(queue.cards);
      const count = Math.min(queue.cards.length, 3);

      for (const phone of [...new Set(phones)]) {
        attempted++;
        const result = await sendAlimtalk({
          to: phone,
          templateId: 'MORNING_BRIEFING',
          variables: {
            farmName: farm.name,
            count: String(count),
            lines,
          },
          farmName: farm.name,
        });
        if (result.success) sent++;
      }
    } catch (err) {
      logger.error({ err, farmId: farm.farmId }, '[MorningBriefing] 농장 브리핑 실패 — 다음 농장 계속');
    }
  }

  logger.info({ attempted, sent, skippedNoPhone, farms: targets.length }, '[MorningBriefing] 아침 브리핑 완료');
  return { attempted, sent, skippedNoPhone };
}
