// 사용자 관리 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, requirePlatformAdmin } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { users, userFarmAccess, farms } from '../../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { isOwnerUserId, setUserApproval } from '../../services/auth/approval.service.js';
import { revokeAllUserRefreshTokens } from '../../db/repositories/user.repo.js';
import { ForbiddenError, BadRequestError } from '../../lib/errors.js';
import { ROLES } from '@cowtalk/shared';

export const userRouter = Router();

const VALID_ROLES: readonly string[] = ROLES.map((r) => r.role);
const VALID_STATUSES: readonly string[] = ['active', 'inactive', 'suspended'];

userRouter.use(authenticate);

// GET /users — 사용자 목록
// SEC-06: 사용자 목록은 플랫폼 관리자만 (배정이 걸린 행정관 제외)
userRouter.get('/', requirePermission('user', 'read'), requirePlatformAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();

    const userList = await db
      .select({
        userId: users.userId,
        name: users.name,
        phone: users.phone,
        email: users.email,
        role: users.role,
        status: users.status,
        approvalStatus: users.approvalStatus,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.status, 'active'))
      .orderBy(users.name);

    res.json({ success: true, data: userList });
  } catch (error) {
    next(error);
  }
});

// PUT /users/:userId/farms — 목장 배정 교체 (관리자 전용)
// body: { farmIds: string[] } — 전달된 목록으로 배정을 전면 교체한다 (빈 배열 = 전체 해제)
userRouter.put('/:userId/farms', requirePermission('user', 'update'), requirePlatformAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const targetUserId = req.params.userId as string;
    // SEC-07: 자기 배정을 스스로 바꾸면(특히 전체 해제) 제한 계정이 전국 계정이 된다 — 소유자만 예외
    if (targetUserId === req.user!.userId && !(await isOwnerUserId(req.user!.userId))) {
      throw new ForbiddenError('자기 계정의 목장 배정은 바꿀 수 없습니다');
    }
    const { farmIds } = req.body as { farmIds?: unknown };

    if (!Array.isArray(farmIds) || farmIds.some((f) => typeof f !== 'string') || farmIds.length > 500) {
      throw new BadRequestError('farmIds는 문자열 배열(최대 500개)이어야 합니다');
    }
    const unique = [...new Set(farmIds as string[])];

    // 존재하는 농장만 배정 (오타·삭제 농장 방지)
    if (unique.length > 0) {
      const found = await db
        .select({ farmId: farms.farmId })
        .from(farms)
        .where(inArray(farms.farmId, unique));
      if (found.length !== unique.length) {
        throw new BadRequestError('존재하지 않는 농장이 포함되어 있습니다');
      }
    }

    // 전면 교체: 기존 배정 삭제 → 새 배정 삽입
    await db.delete(userFarmAccess).where(eq(userFarmAccess.userId, targetUserId));
    if (unique.length > 0) {
      await db.insert(userFarmAccess).values(unique.map((farmId) => ({ userId: targetUserId, farmId })));
    }

    // 대상자 세션 폐기 — 다음 로그인/갱신부터 새 스코프의 JWT를 받는다
    await revokeAllUserRefreshTokens(targetUserId);

    res.json({ success: true, data: { userId: targetUserId, farmIds: unique } });
  } catch (error) {
    next(error);
  }
});

// PATCH /users/:userId/approval — 계정 승인/차단 (소유자 전용)
// body: { status: 'approved' | 'pending' | 'revoked' }
userRouter.patch('/:userId/approval', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 소유자 본인만 승인 관리 가능 — JWT가 아니라 DB 실계정 기준으로 검사
    const requesterIsOwner = await isOwnerUserId(req.user!.userId);
    if (!requesterIsOwner) {
      throw new ForbiddenError('계정 승인 관리는 소유자만 할 수 있습니다');
    }

    const targetUserId = req.params.userId as string;
    const { status } = req.body as { status?: string };
    if (status !== 'approved' && status !== 'pending' && status !== 'revoked') {
      throw new BadRequestError('status는 approved/pending/revoked 중 하나여야 합니다');
    }

    // 소유자 자신의 승인은 해제할 수 없다 (잠금 사고 방지)
    if (targetUserId === req.user!.userId && status !== 'approved') {
      throw new BadRequestError('소유자 계정의 승인은 해제할 수 없습니다');
    }

    await setUserApproval(targetUserId, status, req.user!.userId);
    res.json({ success: true, data: { userId: targetUserId, approvalStatus: status } });
  } catch (error) {
    next(error);
  }
});

// GET /users/:userId — 단일 사용자 상세
// 본인 정보는 누구나, 타인 정보는 플랫폼 관리자만 (SEC-06)
function requireSelfOrPlatformAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user && req.params.userId === req.user.userId) {
    next();
    return;
  }
  requirePermission('user', 'read')(req, res, () => requirePlatformAdmin(req, res, next));
}

userRouter.get('/:userId', requireSelfOrPlatformAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const userId = req.params.userId as string;

    const [user] = await db
      .select({
        userId: users.userId,
        name: users.name,
        phone: users.phone,
        email: users.email,
        role: users.role,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.userId, userId));

    if (!user) {
      res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다' });
      return;
    }

    // 사용자의 농장 접근 목록
    const farmAccess = await db
      .select({
        farmId: userFarmAccess.farmId,
        farmName: farms.name,
        permissionLevel: userFarmAccess.permissionLevel,
      })
      .from(userFarmAccess)
      .innerJoin(farms, eq(userFarmAccess.farmId, farms.farmId))
      .where(eq(userFarmAccess.userId, userId));

    res.json({ success: true, data: { ...user, farmAccess } });
  } catch (error) {
    next(error);
  }
});

// PATCH /users/:userId — 사용자 정보 수정
userRouter.patch('/:userId', requirePermission('user', 'update'), requirePlatformAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const userId = req.params.userId as string;
    const { name, role, status, phone } = req.body as Record<string, unknown>;

    // SEC-03: 역할·상태 변경과 소유자 계정 수정은 소유자만 (DB 실계정 기준).
    // 예전엔 행정관이면 누구든 자기·타인의 역할을 바꾸고 이름을 'Master Admin'으로 고쳐 소유자 권한을 얻었다.
    const requesterIsOwner = await isOwnerUserId(req.user!.userId);
    if (!requesterIsOwner) {
      if (role !== undefined || status !== undefined) {
        throw new ForbiddenError('역할·상태 변경은 소유자만 할 수 있습니다');
      }
      if (await isOwnerUserId(userId)) {
        throw new ForbiddenError('소유자 계정은 소유자만 수정할 수 있습니다');
      }
    }
    if (role !== undefined && (typeof role !== 'string' || !VALID_ROLES.includes(role))) {
      throw new BadRequestError('role 값이 올바르지 않습니다');
    }
    if (status !== undefined && (typeof status !== 'string' || !VALID_STATUSES.includes(status))) {
      throw new BadRequestError('status 값이 올바르지 않습니다');
    }
    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2 || name.length > 100)) {
      throw new BadRequestError('이름은 2~100자 문자열이어야 합니다');
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof name === 'string') updateData.name = name.trim();
    if (typeof role === 'string') updateData.role = role;
    if (typeof status === 'string') updateData.status = status;
    if (phone !== undefined) {
      // 승인 알림톡 수신처 — 숫자·하이픈만, 20자 이내 (빈 문자열 = 삭제)
      const cleaned = String(phone).trim();
      if (cleaned !== '' && !/^[0-9-]{9,20}$/.test(cleaned)) {
        res.status(400).json({ success: false, error: '전화번호 형식이 올바르지 않습니다 (예: 010-1234-5678)' });
        return;
      }
      updateData.phone = cleaned === '' ? null : cleaned;
    }

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.userId, userId))
      .returning({
        userId: users.userId,
        name: users.name,
        phone: users.phone,
        email: users.email,
        role: users.role,
        status: users.status,
        updatedAt: users.updatedAt,
      });

    if (!updated) {
      res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});
