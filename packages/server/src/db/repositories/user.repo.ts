// User Repository

import { eq, and, isNull } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { users, userFarmAccess, refreshTokens } from '../schema.js';

type UserRow = typeof users.$inferSelect;
type RefreshTokenRow = typeof refreshTokens.$inferSelect;

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const db = getDb();
  const result = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)));
  return result[0];
}

export async function findUserById(userId: string): Promise<UserRow | undefined> {
  const db = getDb();
  const result = await db
    .select()
    .from(users)
    .where(and(eq(users.userId, userId), isNull(users.deletedAt)));
  return result[0];
}

export async function createUser(
  data: typeof users.$inferInsert,
): Promise<UserRow> {
  const db = getDb();
  const [row] = await db.insert(users).values(data).returning();
  if (!row) {
    throw new Error('Failed to create user');
  }
  return row;
}

export async function updateLastLogin(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.userId, userId));
}

export async function getFarmIdsForUser(userId: string): Promise<readonly string[]> {
  const db = getDb();
  const rows = await db
    .select({ farmId: userFarmAccess.farmId })
    .from(userFarmAccess)
    .where(eq(userFarmAccess.userId, userId));
  return rows.map((r) => r.farmId);
}

export async function addUserFarmAccess(
  userId: string,
  farmIds: readonly string[],
): Promise<void> {
  if (farmIds.length === 0) return;
  const db = getDb();
  await db.insert(userFarmAccess).values(
    farmIds.map((farmId) => ({ userId, farmId })),
  );
}

// --- Refresh Tokens ---

export async function saveRefreshToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<RefreshTokenRow> {
  const db = getDb();
  const [row] = await db
    .insert(refreshTokens)
    .values({ userId, tokenHash, expiresAt })
    .returning();
  if (!row) {
    throw new Error('Failed to save refresh token');
  }
  return row;
}

export async function findRefreshToken(
  tokenHash: string,
): Promise<RefreshTokenRow | undefined> {
  const db = getDb();
  const result = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
  return result[0];
}

export async function revokeRefreshToken(tokenHash: string): Promise<void> {
  const db = getDb();
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.tokenHash, tokenHash));
}

export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}
