// 인증 컨트롤러 — 완전 구현

import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import type { LoginInput, RegisterInput, Role } from '@cowtalk/shared';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/auth.js';
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} from '../../lib/errors.js';
import {
  findUserByEmail,
  findUserById,
  createUser,
  updateLastLogin,
  getFarmIdsForUser,
  addUserFarmAccess,
  saveRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
} from '../../db/repositories/user.repo.js';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;

  const user = await findUserByEmail(email);
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.status !== 'active') {
    throw new UnauthorizedError('Account is not active');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const farmIds = await getFarmIdsForUser(user.userId);

  const accessToken = signAccessToken({
    userId: user.userId,
    role: user.role as Role,
    farmIds,
  });

  const refreshToken = signRefreshToken({ userId: user.userId });
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7일

  await saveRefreshToken(user.userId, refreshTokenHash, expiresAt);
  await updateLastLogin(user.userId);

  res.json({
    success: true,
    data: {
      accessToken,
      refreshToken,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        farmIds,
      },
    },
  });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as { refreshToken: string };

  let payload: { userId: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const tokenHash = hashToken(refreshToken);
  const stored = await findRefreshToken(tokenHash);
  if (!stored) {
    throw new UnauthorizedError('Refresh token not found or revoked');
  }

  if (stored.expiresAt < new Date()) {
    await revokeRefreshToken(tokenHash);
    throw new UnauthorizedError('Refresh token expired');
  }

  const user = await findUserById(payload.userId);
  if (!user || user.status !== 'active') {
    throw new UnauthorizedError('User not found or inactive');
  }

  // 기존 토큰 폐기 (rotation)
  await revokeRefreshToken(tokenHash);

  const farmIds = await getFarmIdsForUser(user.userId);

  const newAccessToken = signAccessToken({
    userId: user.userId,
    role: user.role as Role,
    farmIds,
  });

  const newRefreshToken = signRefreshToken({ userId: user.userId });
  const newHash = hashToken(newRefreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await saveRefreshToken(user.userId, newHash, expiresAt);

  res.json({
    success: true,
    data: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    },
  });
}

export async function logout(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError();
  }

  // 해당 사용자의 모든 refresh token 폐기
  await revokeAllUserRefreshTokens(req.user.userId);

  res.json({ success: true, data: { message: 'Logged out successfully' } });
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError();
  }

  const user = await findUserById(req.user.userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  res.json({
    success: true,
    data: {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
    },
  });
}

// 퀵 로그인 — 이메일만으로 즉시 로그인 (개발/데모 전용)
export async function quickLogin(req: Request, res: Response): Promise<void> {
  const { email } = req.body as { email: string };

  if (!email) {
    throw new UnauthorizedError('Email is required');
  }

  const user = await findUserByEmail(email);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (user.status !== 'active') {
    throw new UnauthorizedError('Account is not active');
  }

  const farmIds = await getFarmIdsForUser(user.userId);

  const accessToken = signAccessToken({
    userId: user.userId,
    role: user.role as Role,
    farmIds,
  });

  const refreshToken = signRefreshToken({ userId: user.userId });
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await saveRefreshToken(user.userId, refreshTokenHash, expiresAt);
  await updateLastLogin(user.userId);

  res.json({
    success: true,
    data: {
      accessToken,
      refreshToken,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        farmIds,
      },
    },
  });
}

export async function register(req: Request, res: Response): Promise<void> {
  const input = req.body as RegisterInput;

  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  const passwordHash = await hashPassword(input.password);

  const user = await createUser({
    name: input.name,
    email: input.email,
    passwordHash,
    role: input.role,
    status: 'active',
  });

  if (input.farmIds && input.farmIds.length > 0) {
    await addUserFarmAccess(user.userId, input.farmIds);
  }

  res.status(201).json({
    success: true,
    data: {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
}
