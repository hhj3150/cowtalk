// 사용자 관리 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { users, userFarmAccess, farms } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { isOwnerUserId, setUserApproval } from '../../services/auth/approval.service.js';
import { ForbiddenError, BadRequestError } from '../../lib/errors.js';

export const userRouter = Router();

userRouter.use(authenticate);

// GET /users — 사용자 목록
userRouter.get('/', requirePermission('user', 'read'), async (_req: Request, res: Response, next: NextFunction) => {
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
userRouter.get('/:userId', requirePermission('user', 'read'), async (req: Request, res: Response, next: NextFunction) => {
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
userRouter.patch('/:userId', requirePermission('user', 'update'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const userId = req.params.userId as string;
    const { name, role, status, phone } = req.body;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (name) updateData.name = name;
    if (role) updateData.role = role;
    if (status) updateData.status = status;
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
