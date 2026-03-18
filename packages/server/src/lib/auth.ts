// JWT + bcrypt 유틸리티

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import type { AuthTokenPayload } from '@cowtalk/shared';

const BCRYPT_ROUNDS = 12;

// --- Password ---

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// --- Access Token ---

export function signAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(
    { ...payload },
    config.JWT_ACCESS_SECRET,
    { expiresIn: config.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
  );
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET);
  return decoded as AuthTokenPayload;
}

// --- Refresh Token ---

export function signRefreshToken(payload: { userId: string }): string {
  return jwt.sign(
    payload,
    config.JWT_REFRESH_SECRET,
    { expiresIn: config.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
  );
}

export function verifyRefreshToken(token: string): { userId: string } {
  const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET);
  return decoded as { userId: string };
}
