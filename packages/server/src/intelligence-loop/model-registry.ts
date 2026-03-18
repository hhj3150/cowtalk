// 모델 버전 관리 서비스 — Intelligence Loop Phase 11B

import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import { modelRegistry } from '../db/schema.js';
import { logger } from '../lib/logger.js';

type ModelRow = typeof modelRegistry.$inferSelect;

interface VersionComparison {
  readonly engineType: string;
  readonly v1: { readonly version: string; readonly metrics: Record<string, unknown> };
  readonly v2: { readonly version: string; readonly metrics: Record<string, unknown> };
}

/**
 * 모델 버전 등록
 */
export async function registerVersion(
  engineType: string,
  version: string,
  metrics: Record<string, unknown>,
): Promise<ModelRow> {
  try {
    const db = getDb();
    const [row] = await db
      .insert(modelRegistry)
      .values({
        engineType,
        version,
        metrics,
        isActive: true,
      })
      .returning();

    if (!row) {
      throw new Error('Failed to register model version');
    }

    logger.info(
      { modelId: row.modelId, engineType, version },
      'Model version registered',
    );
    return row;
  } catch (error) {
    logger.error({ error, engineType, version }, 'Failed to register version');
    throw error;
  }
}

/**
 * 현재 활성 버전 조회
 */
export async function getActiveVersion(
  engineType: string,
): Promise<ModelRow | null> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(modelRegistry)
      .where(
        and(
          eq(modelRegistry.engineType, engineType),
          eq(modelRegistry.isActive, true),
        ),
      )
      .orderBy(desc(modelRegistry.deployedAt))
      .limit(1);

    return row ?? null;
  } catch (error) {
    logger.error({ error, engineType }, 'Failed to get active version');
    throw error;
  }
}

/**
 * 두 버전 비교
 */
export async function compareVersions(
  engineType: string,
  v1: string,
  v2: string,
): Promise<VersionComparison> {
  try {
    const db = getDb();

    const [version1] = await db
      .select()
      .from(modelRegistry)
      .where(
        and(
          eq(modelRegistry.engineType, engineType),
          eq(modelRegistry.version, v1),
        ),
      )
      .limit(1);

    const [version2] = await db
      .select()
      .from(modelRegistry)
      .where(
        and(
          eq(modelRegistry.engineType, engineType),
          eq(modelRegistry.version, v2),
        ),
      )
      .limit(1);

    if (!version1 || !version2) {
      throw new Error(`Version not found: ${!version1 ? v1 : v2}`);
    }

    return {
      engineType,
      v1: {
        version: version1.version,
        metrics: (version1.metrics as Record<string, unknown>) ?? {},
      },
      v2: {
        version: version2.version,
        metrics: (version2.metrics as Record<string, unknown>) ?? {},
      },
    };
  } catch (error) {
    logger.error({ error, engineType, v1, v2 }, 'Failed to compare versions');
    throw error;
  }
}

/**
 * 버전 이력 조회
 */
export async function getVersionHistory(
  engineType: string,
): Promise<readonly ModelRow[]> {
  try {
    const db = getDb();
    return await db
      .select()
      .from(modelRegistry)
      .where(eq(modelRegistry.engineType, engineType))
      .orderBy(desc(modelRegistry.deployedAt));
  } catch (error) {
    logger.error({ error, engineType }, 'Failed to get version history');
    throw error;
  }
}
