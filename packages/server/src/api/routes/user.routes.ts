// 사용자 관리 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { users, userFarmAccess, farms } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import '../../types/express.d.js';

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
        email: users.email,
        role: users.role,
        status: users.status,
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

// GET /users/:userId — 단일 사용자 상세
userRouter.get('/:userId', requirePermission('user', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const userId = req.params.userId as string;

    const [user] = await db
      .select({
        userId: users.userId,
        name: users.name,
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
    const { name, role, status } = req.body;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (name) updateData.name = name;
    if (role) updateData.role = role;
    if (status) updateData.status = status;

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.userId, userId))
      .returning({
        userId: users.userId,
        name: users.name,
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
