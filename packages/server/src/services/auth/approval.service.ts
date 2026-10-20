// 계정 승인 서비스 — 소유자(마스터)가 승인한 계정만 플랫폼에 접근한다
//
// 정책:
// - approved 만 통과. pending/revoked 는 로그인·API 전부 차단.
// - 조회는 60초 캐시 (매 요청 DB 왕복 방지). 승인 변경 시 즉시 무효화.
// - DB 조회 실패 시 차단(fail-closed) — 접근 통제가 목적이므로 열어두지 않는다.
// - 승인 관리 권한은 소유자 본인뿐: 소유자 이메일로만 판정한다.
//   (SEC-03: 예전엔 government_admin + 이름에 'Master Admin' 이면 소유자로 봤다 —
//    행정관 계정이 자기 이름을 바꾸는 것만으로 승인 관리 권한을 얻을 수 있었다)

import { eq, sql } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { users } from '../../db/schema.js';
import { revokeAllUserRefreshTokens } from '../../db/repositories/user.repo.js';
import { logger } from '../../lib/logger.js';
import { setBounded } from '../../lib/bounded-map.js';
import { config } from '../../config/index.js';
import type { ApprovalStatus } from '@cowtalk/shared';

/** 소유자 식별 — 마이그레이션 0032의 승인 조건과 동일해야 한다 */
export const OWNER_EMAILS: readonly string[] = ['ha@d2o.kr', 'hhj3150@hanmail.net'];

/** 소유자 판정 — 이메일만 본다. 이름·역할은 사용자 수정 API로 바뀔 수 있는 값이라 근거가 될 수 없다. */
export function isOwnerAccount(user: { readonly email: string | null | undefined }): boolean {
  return isOwnerEmail(user.email);
}

/**
 * 토큰에 실을 데이터 스코프. 소유자 계정은 목장 배정과 무관하게 **전체 목장**을 본다.
 *
 * 왜 필요한가: 스코프는 "배정 우선" 규칙이라, 소유자 계정에 목장이 하나라도 배정되면
 * (예: 파일럿 목장을 직접 관리하려고 배정) 그 목장 데이터만 보이게 된다. 소유자는 플랫폼
 * 전체를 운영·점검해야 하므로 배정을 무시하고 마스터(isMaster)로 발급한다.
 */
export function tokenScopeFor(
  email: string | null | undefined,
  assignedFarmIds: readonly string[],
): { readonly farmIds: string[]; readonly isMaster?: true; readonly openScope?: true } {
  const normalized = (email ?? '').trim().toLowerCase();
  if (OWNER_EMAILS.includes(normalized)) return { farmIds: [], isMaster: true };
  // 소유자 단독 운영 단계 — 승인된 모든 계정에 전체 '데이터' 공개 (Railway OPEN_DATA_SCOPE=true)
  // SEC-21: 데이터 범위만 연다. 관리 권한(isMaster)은 주지 않는다
  if (config.OPEN_DATA_SCOPE) return { farmIds: [], openScope: true };
  return { farmIds: [...assignedFarmIds] };
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  return OWNER_EMAILS.includes((email ?? '').trim().toLowerCase());
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
    setBounded(approvalCache, userId, { at: Date.now(), approved }, 10_000); // OPS-16
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
    .select({ email: users.email })
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
  } else {
    // SEC-17: 자가 가입 때 'pending' 으로 만든 농장을 승인과 함께 활성화
    await db.execute(sql`
      UPDATE farms SET status = 'active', updated_at = now()
      WHERE status = 'pending'
        AND farm_id IN (SELECT farm_id FROM user_farm_access WHERE user_id = ${targetUserId})
    `);
  }
  invalidateApprovalCache(targetUserId);
  logger.info({ targetUserId, status, changedBy }, '[Approval] 계정 승인 상태 변경');
}
