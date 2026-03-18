// AI 오케스트레이터 — CowTalk AI Brain 진입점
// 프로파일 빌드 → v4 보조 분석 → Claude 해석 → 알림 → 캐시 → 서빙

import type {
  Role,
  AnimalInterpretation, FarmInterpretation,
  RegionalInterpretation, TenantInterpretation,
} from '@cowtalk/shared';
import {
  buildAnimalProfile, buildFarmProfile,
  buildRegionalProfile, buildTenantProfile,
} from '../pipeline/profile-builder.js';
import {
  interpretAnimal, interpretFarm,
  interpretRegion, interpretTenant,
} from './claude-interpreter.js';
import {
  extractAlertsFromAnimal, extractAlertsFromFarm,
  filterByCooldown, sortByPriority, markAlertSent,
} from './alert/alert-manager.js';
import { sendBatchNotifications } from './alert/notification.js';
import { logger } from '../lib/logger.js';

// ===========================
// 개체 분석
// ===========================

export async function analyzeAnimal(
  animalId: string,
  role: Role = 'farmer',
): Promise<AnimalInterpretation | null> {
  const profile = await buildAnimalProfile(animalId);
  if (!profile) {
    logger.warn({ animalId }, 'Animal not found for analysis');
    return null;
  }

  const interpretation = await interpretAnimal(profile, role);

  // 알림 처리
  const rawAlerts = extractAlertsFromAnimal(interpretation)
    .map((a) => ({ ...a, farmId: profile.farmId }));
  const filtered = filterByCooldown(rawAlerts);
  const sorted = sortByPriority(filtered);

  if (sorted.length > 0) {
    await sendBatchNotifications(sorted);
    for (const alert of sorted) {
      markAlertSent(alert);
    }
  }

  return interpretation;
}

// ===========================
// 농장 분석
// ===========================

export async function analyzeFarm(
  farmId: string,
  role: Role = 'farmer',
): Promise<FarmInterpretation | null> {
  const profile = await buildFarmProfile(farmId);
  if (!profile) {
    logger.warn({ farmId }, 'Farm not found for analysis');
    return null;
  }

  const interpretation = await interpretFarm(profile, role);

  // 알림 처리
  const rawAlerts = extractAlertsFromFarm(interpretation);
  const filtered = filterByCooldown(rawAlerts);
  const sorted = sortByPriority(filtered);

  if (sorted.length > 0) {
    await sendBatchNotifications(sorted);
    for (const alert of sorted) {
      markAlertSent(alert);
    }
  }

  return interpretation;
}

// ===========================
// 지역 분석
// ===========================

export async function analyzeRegion(
  regionId: string,
  role: Role = 'government_admin',
): Promise<RegionalInterpretation | null> {
  const profile = await buildRegionalProfile(regionId);
  if (!profile) {
    logger.warn({ regionId }, 'Region not found for analysis');
    return null;
  }

  return interpretRegion(profile, role);
}

// ===========================
// 테넌트 분석
// ===========================

export async function analyzeTenant(
  tenantId: string,
  role: Role = 'veterinarian',
): Promise<TenantInterpretation | null> {
  const profile = await buildTenantProfile(tenantId);
  return interpretTenant(profile, role);
}

// ===========================
// 스케줄 분석 (5분 주기)
// ===========================

export async function runScheduledAnalysis(): Promise<void> {
  logger.info('Starting scheduled AI analysis cycle');
  // 구현: Phase 5에서 Pipeline Orchestrator와 연동
  // 모든 활성 농장의 활성 이벤트가 있는 동물만 분석
  logger.info('Scheduled AI analysis cycle completed');
}

// re-export for convenience
export { isClaudeAvailable } from './claude-client.js';
export { runV4Analysis } from './v4-engines/index.js';
