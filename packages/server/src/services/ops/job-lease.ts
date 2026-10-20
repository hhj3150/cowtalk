// 잡 임대 · 발송 원장 — OPS-04
//
// Redis(BullMQ)가 없으면 레플리카마다 모든 잡이 각자 돌았다. 여기서는 Postgres 한 행으로 짧은 임대를 잡아
// 한 주기에 한 인스턴스만 실행하게 한다. 테이블이 아직 없거나(마이그레이션 0040 미적용) DB 오류면
// null 을 돌려 호출부가 기존 동작(그냥 실행 / 메모리 가드)으로 돌아가게 한다 — 기능이 멈추지 않게.

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { logger } from '../../lib/logger.js';

/** 이 프로세스 식별자 — 임대 보유자 표시 */
export const INSTANCE_ID = `${process.env.RAILWAY_REPLICA_ID ?? process.env.HOSTNAME ?? 'local'}:${randomUUID().slice(0, 8)}`;

/**
 * 임대 획득 시도. true = 이번 주기 실행, false = 다른 인스턴스가 보유, null = 판단 불가(테이블 없음·DB 오류).
 */
export async function tryAcquireJobLease(name: string, ttlMs: number, holder: string = INSTANCE_ID): Promise<boolean | null> {
  try {
    const rows = await getDb().execute(sql`
      INSERT INTO job_leases (name, holder, expires_at)
      VALUES (${name}, ${holder}, now() + make_interval(secs => ${ttlMs / 1000}))
      ON CONFLICT (name) DO UPDATE
        SET holder = EXCLUDED.holder, expires_at = EXCLUDED.expires_at
        WHERE job_leases.expires_at < now() OR job_leases.holder = EXCLUDED.holder
      RETURNING holder
    `) as unknown as Array<{ holder: string }>;
    return rows.length > 0;
  } catch (err) {
    logger.warn({ err, job: name }, '[JobLease] 임대 판단 불가 — 기존 동작(실행)으로 진행');
    return null;
  }
}

/**
 * 아침 브리핑 발송 선점. true = 이 인스턴스가 오늘 이 농장을 보낸다, false = 이미 누가 보냈다(보내는 중),
 * null = 판단 불가.
 */
export async function claimBriefingDelivery(farmId: string, kstDate: string, holder: string = INSTANCE_ID): Promise<boolean | null> {
  try {
    const rows = await getDb().execute(sql`
      INSERT INTO briefing_deliveries (farm_id, briefing_date, claimed_by)
      VALUES (${farmId}, ${kstDate}::date, ${holder})
      ON CONFLICT (farm_id, briefing_date) DO NOTHING
      RETURNING farm_id
    `) as unknown as Array<{ farm_id: string }>;
    return rows.length > 0;
  } catch (err) {
    logger.warn({ err, farmId }, '[BriefingLedger] 발송 원장 판단 불가 — 메모리 가드로 진행');
    return null;
  }
}

/** 잡 임대 TTL — 다음 주기 전에 풀리되(0.9×주기), 최소 60초 */
export function leaseTtlFor(everyMs: number): number {
  return Math.max(60_000, Math.floor(everyMs * 0.9));
}
