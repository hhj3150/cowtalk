// 목장별 번식·대시보드 설정 서비스
//
// 값의 출처 3단: 직접 입력(manual) > smaXtec 동기화 > CowTalk 기본값.
// - 직접 입력: /settings/breeding 화면 → PUT /breeding/farm/:farmId/settings
// - smaXtec 동기화: GET /api/v2/organisations/{org_id}/settings (일 배치)
//   ⚠️ 응답 키 이름은 실응답으로 검증되지 않았다 — 원본을 smaxtecRaw 로 보존해 확인 후 매핑을 고친다.
//   직접 입력한 키는 동기화가 절대 덮어쓰지 않는다.
// 정의·기본값·병합·검증 규칙은 @cowtalk/shared 의 breeding-settings 가 단일 원천.

import { getDb } from '../../config/database.js';
import { config } from '../../config/index.js';
import { farms } from '../../db/schema.js';
import type { FarmBreedingSettings } from '../../db/schema.js';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import { SmaxtecApiClient } from '../../pipeline/connectors/smaxtec.connector.js';
import {
  applyManualPatch,
  mergeSmaxtecSettings,
  resolveBreedingSettings,
} from '@cowtalk/shared';
import type {
  BreedingSettingKey,
  BreedingSettingsPatch,
  ResolvedBreedingSettings,
} from '@cowtalk/shared';

// smaXtec settings 응답 키 → CowTalk 키 (추정 — smaxtecRaw 로 실응답 확인 후 보정)
const SMAXTEC_KEY_MAP: Readonly<Record<string, BreedingSettingKey>> = {
  'todo_unacknowledged_health_alerts_hours': 'unacknowledgedHealthAlertHours',
  'todo_heat_hours': 'heatListHours',
  'todo_oestrus_recurrence': 'estrusRecurrenceDays',
  'todo_min_breeding_age_months': 'minBreedingAgeMonths',
  'todo_oestrus_detection_after_dim': 'estrusDetectionAfterDim',
  'todo_insemination_window_start': 'inseminationWindowStartHours',
  'todo_insemination_window_end': 'inseminationWindowEndHours',
  'todo_sexed_semen_window_start': 'sexedSemenWindowStartHours',
  'todo_sexed_semen_window_end': 'sexedSemenWindowEndHours',
  'todo_pregnancy_check_days': 'pregnancyCheckDays',
  'todo_gestation_days': 'gestationDays',
  'todo_pregnant_heat_interval_min': 'pregnantHeatIntervalMinDays',
  'todo_pregnant_heat_interval_max': 'pregnantHeatIntervalMaxDays',
  'todo_abort_suspected_exclude_days': 'abortSuspectExcludeDaysBeforeCalving',
  'todo_dry_off_before_calving': 'dryOffBeforeCalvingDays',
  'todo_calving_soon_days': 'calvingSoonDays',
  'health_alerts_hours': 'healthAlertListHours',
  'health_graph_days': 'healthGraphDays',
  'fertility_fresh_cow_dim': 'freshCowDim',
  'fertility_no_heat_dim': 'noHeatDim',
  'todo_long_open_days_dim': 'longOpenDaysDim',
};

/** smaXtec settings 응답에서 매핑된 수치만 추출 (응답이 { settings: {...} } 로 감싸진 경우도 흡수) */
export function extractBreedingSettings(raw: Readonly<Record<string, unknown>>): BreedingSettingsPatch {
  const nested = raw.settings;
  const flat: Readonly<Record<string, unknown>> =
    nested != null && typeof nested === 'object' && !Array.isArray(nested)
      ? { ...raw, ...(nested as Record<string, unknown>) }
      : raw;

  const out: Partial<Record<BreedingSettingKey, number>> = {};
  for (const [smaxtecKey, key] of Object.entries(SMAXTEC_KEY_MAP)) {
    const value = flat[smaxtecKey];
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

async function loadStored(farmId: string): Promise<FarmBreedingSettings | null> {
  const db = getDb();
  const [farm] = await db.select({ breedingSettings: farms.breedingSettings })
    .from(farms)
    .where(eq(farms.farmId, farmId));
  return farm ? (farm.breedingSettings ?? {}) : null;
}

/** 저장 원본 (출처 메타 포함) — 농장이 없으면 null */
export async function getStoredBreedingSettings(farmId: string): Promise<FarmBreedingSettings | null> {
  return loadStored(farmId);
}

/** 유효값 (기본값까지 병합) — 리마인더·인사이트·수정 적기 계산은 전부 이것을 쓴다 */
export async function getFarmBreedingSettings(farmId: string): Promise<ResolvedBreedingSettings> {
  return resolveBreedingSettings(await loadStored(farmId));
}

/** CowTalk 기본값 (설정이 하나도 없을 때) */
export function getDefaultBreedingSettings(): ResolvedBreedingSettings {
  return resolveBreedingSettings({});
}

/** 직접 입력 저장 — 검증은 호출부(validateBreedingSettingsPatch)에서 끝낸 패치만 받는다 */
export async function saveManualBreedingSettings(
  farmId: string,
  patch: BreedingSettingsPatch,
  userId: string,
): Promise<FarmBreedingSettings | null> {
  const stored = await loadStored(farmId);
  if (stored === null) return null;
  const next = applyManualPatch(stored, patch, userId, new Date());
  const db = getDb();
  await db.update(farms)
    .set({ breedingSettings: next, updatedAt: new Date() })
    .where(eq(farms.farmId, farmId));
  logger.info({ farmId, userId, keys: Object.keys(patch) }, '[FarmSettings] 직접 입력 저장');
  return next;
}

/** 단일 목장 smaXtec 동기화 — 직접 입력 키는 보존 */
export async function syncFarmSettings(
  farmId: string,
  smaxtecOrgId: string,
  client: SmaxtecApiClient,
): Promise<FarmBreedingSettings | null> {
  try {
    const response = await client.getOrganisationSettings(smaxtecOrgId);
    if (response == null || typeof response !== 'object' || Array.isArray(response)) {
      logger.warn({ farmId, smaxtecOrgId }, '[FarmSettingsSync] 응답 형식이 객체가 아님 — 건너뜀');
      return null;
    }
    const raw = response as Record<string, unknown>;
    const stored = (await loadStored(farmId)) ?? {};
    const extracted = extractBreedingSettings(raw);
    const next = mergeSmaxtecSettings(stored, extracted, raw, new Date());

    const db = getDb();
    await db.update(farms)
      .set({ breedingSettings: next, updatedAt: new Date() })
      .where(eq(farms.farmId, farmId));

    logger.info({
      farmId,
      smaxtecOrgId,
      mappedKeys: Object.keys(extracted),
      rawKeyCount: Object.keys(raw).length,
    }, '[FarmSettingsSync] 목장 설정 동기화 완료');
    return next;
  } catch (err) {
    logger.warn({ err, farmId, smaxtecOrgId }, '[FarmSettingsSync] 동기화 실패');
    return null;
  }
}

/** 전체 목장 smaXtec 설정 동기화 (일 배치) — 한 목장 실패가 다른 목장을 막지 않는다 */
export async function syncAllFarmSettings(): Promise<{ readonly synced: number; readonly failed: number; readonly skipped: boolean }> {
  const email = config.SMAXTEC_EMAIL ?? process.env.SMAXTEC_EMAIL;
  const password = config.SMAXTEC_PASSWORD ?? process.env.SMAXTEC_PASSWORD;
  const apiKey = config.SMAXTEC_API_KEY ?? process.env.SMAXTEC_API_KEY;
  if (!apiKey && (!email || !password)) {
    return { synced: 0, failed: 0, skipped: true };
  }

  const client = new SmaxtecApiClient(email ?? '', password ?? '', apiKey);
  const db = getDb();
  const rows = await db.select({ farmId: farms.farmId, externalId: farms.externalId })
    .from(farms)
    .where(and(isNotNull(farms.externalId), isNull(farms.deletedAt)));

  let synced = 0;
  let failed = 0;
  for (const row of rows) {
    if (!row.externalId) continue;
    const result = await syncFarmSettings(row.farmId, row.externalId, client);
    if (result) synced += 1;
    else failed += 1;
    // 엔드포인트 자체가 안 맞으면(초기 5곳 연속 실패) 201곳에 매일 헛호출하지 않는다
    if (synced === 0 && failed >= 5) {
      logger.warn({ failed }, '[FarmSettingsSync] 초기 연속 실패 — settings 엔드포인트/권한 확인 필요, 이번 배치 중단');
      break;
    }
  }
  logger.info({ synced, failed, total: rows.length }, '[FarmSettingsSync] 전체 목장 설정 동기화 종료');
  return { synced, failed, skipped: false };
}
