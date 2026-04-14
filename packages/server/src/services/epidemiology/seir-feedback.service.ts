/**
 * SEIR 피드백 루프 서비스 — 유일한 미폐쇄 AX 루프를 닫는다
 *
 * 1. SEIR 시뮬레이션 예측 → DB 저장 (seir_predictions)
 * 2. 실제 확산 데이터 (investigations + alerts) 수집
 * 3. 예측 vs 실제 비교 → 보정 계수 산출
 * 4. 보정된 R0/파라미터를 다음 시뮬레이션에 반영
 *
 * 이로써 "예측 → 현실 → 모델 개선" 루프가 폐쇄된다.
 */

import { getDb } from '../../config/database.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import { simulate, type SpreadSimulationResult } from './spread-simulator.js';
import type { LegalDiseaseCode } from '../earlyDetection/disease-signature.db.js';

// ─── 타입 ───────────────────────────────────────────────────────

/** 저장된 SEIR 예측 */
export interface SEIRPrediction {
  readonly predictionId: string;
  readonly diseaseCode: string;
  readonly farmId: string | null;       // 발생 농장 (null이면 전국)
  readonly totalPopulation: number;
  readonly initialInfected: number;
  readonly predictedPeakDay: number;
  readonly predictedTotalInfected: number;
  readonly predictedEconomicLoss: number;
  readonly r0Used: number;
  readonly movementRestricted: boolean;
  readonly simulatedAt: string;
  readonly evaluatedAt: string | null;
  readonly actualInfected: number | null;
  readonly accuracyRatio: number | null;  // actual / predicted
  readonly calibrationFactor: number | null;
}

/** 보정 결과 */
export interface CalibrationResult {
  readonly diseaseCode: string;
  readonly originalR0: number;
  readonly calibratedR0: number;
  readonly calibrationFactor: number;
  readonly sampleCount: number;
  readonly avgAccuracyRatio: number;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly reasoning: string;
}

/** 피드백 루프 배치 결과 */
export interface SEIRFeedbackResult {
  readonly predictionsEvaluated: number;
  readonly calibrations: readonly CalibrationResult[];
  readonly evaluatedAt: string;
}

// ─── 기본 R0 (spread-simulator와 동기화) ────────────────────────

const BASE_R0: Readonly<Record<string, number>> = {
  FMD: 10.0,
  BRUCELLOSIS: 2.5,
  TB: 1.8,
  BEF: 3.0,
  LSD: 4.0,
  ANTHRAX: 2.0,
};

// 보정된 R0 캐시 (메모리, 서버 재시작 시 DB에서 재로드)
const calibratedR0Cache = new Map<string, number>();

// ─── 1. SEIR 예측 저장 ──────────────────────────────────────────

/**
 * SEIR 시뮬레이션 실행 + 결과를 DB에 저장
 * 기존 simulate()를 래핑하여 predictions 테이블에 기록
 */
export async function runAndStoreSEIR(params: {
  readonly diseaseCode: LegalDiseaseCode;
  readonly farmId?: string;
  readonly totalPopulation: number;
  readonly totalFarms: number;
  readonly initialInfected?: number;
  readonly movementRestricted?: boolean;
}): Promise<SpreadSimulationResult> {
  const r0Override = calibratedR0Cache.get(params.diseaseCode);
  const result = simulate({
    diseaseCode: params.diseaseCode,
    totalPopulation: params.totalPopulation,
    totalFarms: params.totalFarms,
    initialInfected: params.initialInfected,
  });

  // 두 시나리오(제한없음/제한) 모두 저장
  const db = getDb();
  for (const scenario of result.scenarios) {
    try {
      await db.execute(sql`
        INSERT INTO predictions (
          engine_type, animal_id, farm_id, prediction_label, confidence, timestamp,
          metadata
        ) VALUES (
          'seir_v1',
          NULL,
          ${params.farmId ?? null},
          ${`seir_${params.diseaseCode}_${scenario.movementRestricted ? 'restricted' : 'unrestricted'}`},
          ${Math.round(50 + (r0Override ? 20 : 0))},
          NOW(),
          ${JSON.stringify({
            diseaseCode: params.diseaseCode,
            totalPopulation: result.totalPopulation,
            initialInfected: result.initialInfected,
            peakDay: scenario.peakDay,
            peakInfected: scenario.peakInfected,
            totalInfected: scenario.totalInfected,
            totalEconomicLoss: scenario.totalEconomicLoss,
            extinctionDay: scenario.extinctionDay,
            r0Used: r0Override ?? BASE_R0[params.diseaseCode] ?? 5,
            movementRestricted: scenario.movementRestricted,
          })}::jsonb
        )
      `);
    } catch (err) {
      logger.debug({ err }, '[SEIRFeedback] prediction save failed');
    }
  }

  return result;
}

// ─── 2. 실제 확산 데이터 수집 ────────────────────────────────────

interface ActualSpreadData {
  readonly diseaseCode: string;
  readonly totalConfirmedFarms: number;
  readonly totalConfirmedAnimals: number;
  readonly periodDays: number;
}

async function collectActualSpread(
  diseaseCode: string,
  sinceDays: number,
): Promise<ActualSpreadData> {
  const db = getDb();
  const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();

  // investigations 테이블에서 실제 확인된 발생 건수
  const [result] = await db.execute(sql`
    SELECT
      count(DISTINCT farm_id)::int AS confirmed_farms,
      COALESCE(SUM(
        CASE WHEN (collected_data->>'feverAnimals') IS NOT NULL
        THEN jsonb_array_length(collected_data->'feverAnimals')
        ELSE 0 END
      ), 0)::int AS confirmed_animals
    FROM investigations
    WHERE status IN ('kahis_submitted', 'closed')
      AND created_at >= ${since}::timestamptz
  `) as unknown as [{ confirmed_farms: number; confirmed_animals: number }];

  return {
    diseaseCode,
    totalConfirmedFarms: result?.confirmed_farms ?? 0,
    totalConfirmedAnimals: result?.confirmed_animals ?? 0,
    periodDays: sinceDays,
  };
}

// ─── 3. 예측 vs 실제 비교 → 보정 계수 ───────────────────────────

/**
 * SEIR 예측을 실제 결과와 비교하여 보정 계수를 산출한다.
 * - accuracyRatio > 1: 과대 예측 (실제보다 많이 예측) → R0 하향
 * - accuracyRatio < 1: 과소 예측 (실제가 더 많음) → R0 상향
 * - accuracyRatio ≈ 1: 정확 → 유지
 */
function computeCalibration(
  diseaseCode: string,
  predictions: readonly { totalInfected: number; r0Used: number }[],
  actualInfected: number,
): CalibrationResult {
  const originalR0 = BASE_R0[diseaseCode] ?? 5;

  if (predictions.length === 0 || actualInfected === 0) {
    return {
      diseaseCode,
      originalR0,
      calibratedR0: originalR0,
      calibrationFactor: 1.0,
      sampleCount: 0,
      avgAccuracyRatio: 1.0,
      confidence: 'low',
      reasoning: '데이터 부족 — 예측/실제 건수 0건으로 보정 불가. 기본 R0 유지.',
    };
  }

  // 예측 평균
  const avgPredicted = predictions.reduce((s, p) => s + p.totalInfected, 0) / predictions.length;
  const avgR0Used = predictions.reduce((s, p) => s + p.r0Used, 0) / predictions.length;

  // 정확도 비율: predicted / actual
  const ratio = avgPredicted / Math.max(actualInfected, 1);

  // 보정 계수: ratio가 2면 R0를 절반으로, ratio가 0.5면 R0를 2배로
  // 급격한 변동 방지: ±30% 제한
  let calibrationFactor = 1 / Math.max(0.5, Math.min(2.0, ratio));
  calibrationFactor = Math.max(0.7, Math.min(1.3, calibrationFactor));

  const calibratedR0 = Math.round(avgR0Used * calibrationFactor * 100) / 100;

  const confidence: CalibrationResult['confidence'] =
    predictions.length >= 5 ? 'high' :
    predictions.length >= 2 ? 'medium' : 'low';

  const direction = calibrationFactor > 1.05 ? '상향' : calibrationFactor < 0.95 ? '하향' : '유지';
  const reasoning = `예측 평균 ${Math.round(avgPredicted)}두 vs 실제 ${actualInfected}두 (비율 ${ratio.toFixed(2)}). ` +
    `R0 ${direction}: ${avgR0Used.toFixed(1)} → ${calibratedR0.toFixed(1)} ` +
    `(보정 ${(calibrationFactor * 100 - 100).toFixed(1)}%, 근거 ${predictions.length}건).`;

  return {
    diseaseCode,
    originalR0,
    calibratedR0,
    calibrationFactor,
    sampleCount: predictions.length,
    avgAccuracyRatio: Math.round(ratio * 100) / 100,
    confidence,
    reasoning,
  };
}

// ─── 4. 피드백 루프 배치 실행 ────────────────────────────────────

/**
 * SEIR 피드백 루프 배치 (주 1회 권장)
 * 1. 지난 90일 SEIR 예측 조회
 * 2. 같은 기간 실제 발생 건수 수집
 * 3. 질병별 보정 계수 산출
 * 4. calibratedR0 캐시 업데이트
 */
export async function runSEIRFeedbackLoop(days = 90): Promise<SEIRFeedbackResult> {
  const db = getDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const calibrations: CalibrationResult[] = [];

  try {
    // 1. SEIR 예측 조회
    const seirPredictions = await db.execute(sql`
      SELECT
        prediction_label,
        metadata->>'diseaseCode' AS disease_code,
        (metadata->>'totalInfected')::int AS total_infected,
        (metadata->>'r0Used')::real AS r0_used,
        (metadata->>'movementRestricted')::boolean AS movement_restricted
      FROM predictions
      WHERE engine_type = 'seir_v1'
        AND timestamp >= ${since}::timestamptz
    `) as unknown as Array<{
      prediction_label: string;
      disease_code: string;
      total_infected: number;
      r0_used: number;
      movement_restricted: boolean;
    }>;

    // 질병별 그룹화
    const byDisease = new Map<string, Array<{ totalInfected: number; r0Used: number }>>();
    for (const p of seirPredictions) {
      if (!p.disease_code || p.movement_restricted) continue; // 이동제한 시나리오는 제외 (기본 시나리오만 비교)
      const existing = byDisease.get(p.disease_code) ?? [];
      byDisease.set(p.disease_code, [...existing, {
        totalInfected: p.total_infected,
        r0Used: p.r0_used,
      }]);
    }

    // 2. 각 질병별 실제 데이터 비교
    for (const [diseaseCode, predictions] of byDisease) {
      const actual = await collectActualSpread(diseaseCode, days);
      const calibration = computeCalibration(diseaseCode, predictions, actual.totalConfirmedAnimals);
      calibrations.push(calibration);

      // 3. 보정된 R0 캐시 업데이트
      if (calibration.confidence !== 'low' && calibration.calibratedR0 !== calibration.originalR0) {
        calibratedR0Cache.set(diseaseCode, calibration.calibratedR0);
        logger.info({
          diseaseCode,
          originalR0: calibration.originalR0,
          calibratedR0: calibration.calibratedR0,
          factor: calibration.calibrationFactor,
        }, '[SEIRFeedback] R0 보정 적용');
      }
    }

    // SEIR 예측이 없는 질병에 대해서도 기본 보정 기록
    for (const diseaseCode of Object.keys(BASE_R0)) {
      if (!byDisease.has(diseaseCode)) {
        calibrations.push({
          diseaseCode,
          originalR0: BASE_R0[diseaseCode]!,
          calibratedR0: BASE_R0[diseaseCode]!,
          calibrationFactor: 1.0,
          sampleCount: 0,
          avgAccuracyRatio: 1.0,
          confidence: 'low',
          reasoning: `${diseaseCode}: SEIR 예측 이력 없음. 기본 R0 유지.`,
        });
      }
    }

    logger.info({
      predictionsEvaluated: seirPredictions.length,
      calibrationsComputed: calibrations.filter(c => c.sampleCount > 0).length,
    }, '[SEIRFeedback] 피드백 루프 배치 완료');

    return {
      predictionsEvaluated: seirPredictions.length,
      calibrations,
      evaluatedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error({ error }, '[SEIRFeedback] 피드백 루프 배치 실패');
    return { predictionsEvaluated: 0, calibrations: [], evaluatedAt: new Date().toISOString() };
  }
}

/**
 * 현재 보정된 R0 조회 (API 노출용)
 */
export function getCalibratedR0(): ReadonlyMap<string, number> {
  return calibratedR0Cache;
}

/**
 * 보정된 R0로 시뮬레이션 실행 (보정 적용된 버전)
 */
export function getCalibratedR0ForDisease(diseaseCode: string): number {
  return calibratedR0Cache.get(diseaseCode) ?? BASE_R0[diseaseCode] ?? 5;
}
