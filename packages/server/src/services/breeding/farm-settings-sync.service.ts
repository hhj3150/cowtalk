// 목장별 smaXtec 설정 동기화 서비스
// GET /api/v2/organisations/{org_id}/settings → farms.breeding_settings JSONB 저장
// 목장마다 발정재귀일, 수정적기, 임신감정시기 등이 다름 → AI가 참조

import { getDb } from '../../config/database.js';
import { farms } from '../../db/schema.js';
import type { FarmBreedingSettings } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

// smaXtec settings API 응답에서 번식 관련 키 매핑
const SMAXTEC_KEY_MAP: Record<string, keyof FarmBreedingSettings> = {
  'todo_oestrus_recurrence': 'estrusRecurrenceDays',
  'todo_insemination_window_start': 'inseminationWindowStartHours',
  'todo_insemination_window_end': 'inseminationWindowEndHours',
  'todo_sexed_semen_window_start': 'sexedSemenWindowStartHours',
  'todo_sexed_semen_window_end': 'sexedSemenWindowEndHours',
  'todo_pregnancy_check_days': 'pregnancyCheckDays',
  'todo_gestation_days': 'gestationDays',
  'todo_dry_off_before_calving': 'dryOffBeforeCalvingDays',
  'todo_min_breeding_age_months': 'minBreedingAgeMonths',
  'todo_oestrus_detection_after_dim': 'estrusDetectionAfterDim',
  'todo_long_open_days_dim': 'longOpenDaysDim',
};

/** smaXtec Organisation Settings API에서 번식 설정 추출 */
function extractBreedingSettings(
  smaxtecSettings: Record<string, unknown>,
): FarmBreedingSettings {
  const result: Record<string, unknown> = {};

  for (const [smaxtecKey, settingsKey] of Object.entries(SMAXTEC_KEY_MAP)) {
    const value = smaxtecSettings[smaxtecKey];
    if (value != null && typeof value === 'number') {
      result[settingsKey] = value;
    }
  }

  result.syncedAt = new Date().toISOString();
  return result as FarmBreedingSettings;
}

/** 단일 목장의 smaXtec 설정 동기화 */
export async function syncFarmSettings(
  farmId: string,
  smaxtecOrgId: string,
  token: string,
): Promise<FarmBreedingSettings | null> {
  try {
    const url = `https://api.smaxtec.com/api/v2/organisations/${smaxtecOrgId}/settings`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      logger.warn({ farmId, smaxtecOrgId, status: response.status }, '[FarmSettingsSync] API 응답 실패');
      return null;
    }

    const rawSettings = await response.json() as Record<string, unknown>;
    const breedingSettings = extractBreedingSettings(rawSettings);

    // DB 저장
    const db = getDb();
    await db.update(farms)
      .set({ breedingSettings, updatedAt: new Date() })
      .where(eq(farms.farmId, farmId));

    logger.info({
      farmId,
      smaxtecOrgId,
      settings: breedingSettings,
    }, '[FarmSettingsSync] 목장 설정 동기화 완료');

    return breedingSettings;
  } catch (err) {
    logger.error({ err, farmId, smaxtecOrgId }, '[FarmSettingsSync] 동기화 실패');
    return null;
  }
}

/** DB에서 목장 번식 설정 조회 (캐시 역할) */
export async function getFarmBreedingSettings(farmId: string): Promise<FarmBreedingSettings> {
  const db = getDb();
  const [farm] = await db.select({ breedingSettings: farms.breedingSettings })
    .from(farms)
    .where(eq(farms.farmId, farmId));

  return farm?.breedingSettings ?? getDefaultBreedingSettings();
}

/** 기본값 (smaXtec 기본값 + 한국 목장 일반 관행) */
export function getDefaultBreedingSettings(): FarmBreedingSettings {
  return {
    estrusRecurrenceDays: 21,
    inseminationWindowStartHours: 10,
    inseminationWindowEndHours: 18,
    sexedSemenWindowStartHours: null,
    sexedSemenWindowEndHours: null,
    pregnancyCheckDays: 28,
    gestationDays: 280,
    dryOffBeforeCalvingDays: 90,
    minBreedingAgeMonths: 12,
    estrusDetectionAfterDim: 20,
    longOpenDaysDim: 200,
  };
}
