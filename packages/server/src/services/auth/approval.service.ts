// 계정 승인 서비스 — 소유자(마스터)가 승인한 계정만 플랫폼에 접근한다
//
// 정책:
// - approved 만 통과. pending/revoked 는 로그인·API 전부 차단.
// - 조회는 60초 캐시 (매 요청 DB 왕복 방지). 승인 변경 시 즉시 무효화.
// - DB 조회 실패 시 차단(fail-closed) — 접근 통제가 목적이므로 열어두지 않는다.
// - 승인 관리 권한은 소유자 본인뿐: government_admin 역할 + 'Master Admin' 명칭
//   또는 소유자 이메일 (기존 master-essence 판정 관례와 동일).

import { eq } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { users } from '../../db/schema.js';
import { revokeAllUserRefreshTokens } from '../../db/repositories/user.repo.js';
import { logger } from '../../lib/logger.js';
import type { ApprovalStatus } from '@cowtalk/shared';

/** 소유자 식별 — 마이그레이션 0032의 승인 조건과 동일해야 한다 */
export const OWNER_EMAILS: readonly string[] = ['ha@d2o.kr', 'hhj3150@hanmail.net'];

export function isOwnerAccount(user: { readonly role: string; readonly name: string; readonly email: string }): boolean {
  return (
    (user.role === 'government_admin' && user.name.includes('Master Admin')) ||
    OWNER_EMAILS.includes(user.email)
  );
}

const CACHE_TTL_MS = 60_000;
const approvalCache = new Map<string, { at: number; approved: boolean }>();

export function invalidateApprovalCache(userId?: string): void {
  if (userId) approvalCache.delete(userId);
  else approvalCache.clear();
}

/** 승인 여부 — 캐시 60초, DB 실패 시 차단(fail-closed) */
export async function isUserApproved(userId: string): Promise<boolean> {
  const hit = approvalCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.approved;

  try {
    const db = getDb();
    const [row] = await db
      .select({ approvalStatus: users.approvalStatus })
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1);
    const approved = row?.approvalStatus === 'approved';
    approvalCache.set(userId, { at: Date.now(), approved });
    return approved;
  } catch (err) {
    logger.error({ err, userId }, '[Approval] 승인 조회 실패 — 차단(fail-closed)');
    return false;
  }
}

/** 요청자가 소유자인지 DB 기준으로 확인 (JWT 위조·역할 전환과 무관하게 실계정 검사) */
export async function isOwnerUserId(userId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ role: users.role, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.userId, userId))
    .limit(1);
  return row ? isOwnerAccount(row) : false;
}

/** 승인 상태 변경 — 승인 해제 시 해당 사용자의 모든 세션(리프레시 토큰) 즉시 폐기 */
export async function setUserApproval(
  targetUserId: string,
  status: ApprovalStatus,
  changedBy: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ approvalStatus: status, updatedAt: new Date() })
    .where(eq(users.userId, targetUserId));

  if (status !== 'approved') {
    await revokeAllUserRefreshTokens(targetUserId);
  }
  invalidateApprovalCache(targetUserId);
  logger.info({ targetUserId, status, changedBy }, '[Approval] 계정 승인 상태 변경');
}
