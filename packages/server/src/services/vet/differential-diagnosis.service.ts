// 감별진단 서비스 — 센서 + v4 질병엔진 + 농장 이력 → 구조화 진단 결과
// 수의사가 납득할 근거 테이블 + 확률 순위 + 확인검사 트리 반환

import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { animals, healthEvents, sensorDailyAgg, farms } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';

// ── 출력 타입 (공유 패키지에서 가져옴) ──

import type {
  SensorEvidence,
  DiagnosisCandidate,
  FarmHistoryPattern,
  SimilarCase,
  DifferentialDiagnosisResult,
} from '@cowtalk/shared';

export type {
  SensorEvidence,
  DiagnosisCandidate,
  FarmHistoryPattern,
  SimilarCase,
  DifferentialDiagnosisResult,
} from '@cowtalk/shared';

import { findSimilarPatterns } from '../sovereign-alarm/pattern-mining.service.js';

// ── 정상 범위 ──

const NORMAL_RANGES: Readonly<Record<string, { min: number; max: number; label: string }>> = {
  temperature: { min: 38.0, max: 39.3, label: '38.0~39.3°C' },
  rumination: { min: 400, max: 600, label: '400~600분/일' },
  activity: { min: 50, max: 200, label: '50~200' },
};

// ── 질병별 근거·검사 매핑 ──

interface DiseaseProfile {
  readonly nameKo: string;
  readonly sensorPattern: Readonly<Record<string, 'high' | 'low' | 'any'>>;
  readonly tests: readonly string[];
  readonly baseWeight: number; // 기본 가중치 (유병률 반영)
}

const DISEASE_PROFILES: Readonly<Record<string, DiseaseProfile>> = {
  mastitis: {
    nameKo: '유방염',
    sensorPattern: { temperature: 'high', rumination: 'low', activity: 'low' },
    tests: ['CMT 검사 (California Mastitis Test)', '유즙 세균배양 + 항생제 감수성', 'SCC 체세포수 검사'],
    baseWeight: 1.2, // 가장 흔한 질병
  },
  ketosis: {
    nameKo: '케토시스',
    sensorPattern: { temperature: 'any', rumination: 'low', activity: 'low' },
    tests: ['뇨 케톤 스트립 (BHB ≥ 1.4 mmol/L)', '혈중 NEFA 검사', '유즙 케톤 검사 (Keto-Test)'],
    baseWeight: 1.0,
  },
  acidosis: {
    nameKo: '반추위 산독증 (SARA)',
    sensorPattern: { temperature: 'any', rumination: 'low', activity: 'any' },
    tests: ['반추위 천자 pH 측정 (< 5.5 확진)', '분변 점수 + 미소화섬유 확인', 'TMR 입자도 분석 (Penn State Shaker Box)'],
    baseWeight: 0.8,
  },
  pneumonia: {
    nameKo: '폐렴 (BRD)',
    sensorPattern: { temperature: 'high', rumination: 'low', activity: 'low' },
    tests: ['폐 청진 (습성수포음, 호흡음 감소)', '비강 면봉 PCR (BVDV, BRSV, M. bovis)', '흉부 초음파 (폐 경화 확인)'],
    baseWeight: 0.7,
  },
  metritis: {
    nameKo: '자궁내막염',
    sensorPattern: { temperature: 'high', rumination: 'low', activity: 'low' },
    tests: ['질 분비물 관찰 (악취·화농성)', '자궁경부 개방도 직장검사', '자궁 초음파 (액체 저류 확인)'],
    baseWeight: 0.6,
  },
  lda: {
    nameKo: '제4위변위 (LDA)',
    sensorPattern: { temperature: 'any', rumination: 'low', activity: 'low' },
    tests: ['좌측 복벽 청타진 (핑음 ping)', '동시 청진-타진 (click)', '직장검사 (변위된 제4위 촉지)'],
    baseWeight: 0.5,
  },
};

// ── 센서 데이터 로드 ──

async function loadSensorData(
  animalId: string,
  days: number = 7,
): Promise<Map<string, { avg: number; values: readonly number[] }>> {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const rows = await db
    .select({ metricType: sensorDailyAgg.metricType, avg: sensorDailyAgg.avg })
    .from(sensorDailyAgg)
    .where(and(
      eq(sensorDailyAgg.animalId, animalId),
      gte(sensorDailyAgg.date, cutoffStr),
    ))
    .orderBy(desc(sensorDailyAgg.date))
    .limit(50);

  const result = new Map<string, { avg: number; values: readonly number[] }>();
  const temp = new Map<string, number[]>();

  for (const r of rows) {
    const arr = temp.get(r.metricType) ?? [];
    arr.push(r.avg);
    temp.set(r.metricType, arr);
  }

  for (const [type, vals] of temp) {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    result.set(type, { avg: Math.round(avg * 100) / 100, values: vals });
  }

  return result;
}

// ── 농장 이력 ──

async function loadFarmHistory(farmId: string, days: number = 90): Promise<readonly FarmHistoryPattern[]> {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const rows = await db
    .select({
      diagnosis: healthEvents.diagnosis,
      count: sql<number>`count(*)::int`,
    })
    .from(healthEvents)
    .innerJoin(animals, eq(healthEvents.animalId, animals.animalId))
    .where(and(
      eq(animals.farmId, farmId),
      gte(healthEvents.eventDate, cutoff),
    ))
    .groupBy(healthEvents.diagnosis)
    .orderBy(sql`count(*) DESC`)
    .limit(10);

  return rows.map((row: { diagnosis: string; count: number }) => ({ diagnosis: row.diagnosis, count: row.count }));
}

// ── AX 학습: 치료 결과 기반 진단 가중치 ──

interface TreatmentOutcomeWeight {
  readonly diagnosis: string;
  readonly totalCases: number;
  readonly recoveredCount: number;
  readonly recoveryRate: number;  // 0~1
  readonly weight: number;        // 가중치 보정 (양수=확률↑, 음수=확률↓)
}

/**
 * 농장·개체의 과거 치료 결과로부터 진단별 학습 가중치를 계산한다.
 * - 이 농장에서 자주 발생하는 질병(유병률) → 확률 상향
 * - 이 개체가 과거 같은 질병으로 치료받은 이력 → 재발 가중치
 * - 치료 성공률이 높은 질병 → 안정 신뢰(변동 없음)
 * - 치료 실패(relapsed/worsened)가 잦으면 → "잘 낫지 않는다" 맥락 제공
 */
async function loadTreatmentOutcomeWeights(
  farmId: string,
  animalId: string,
  days: number = 365,
): Promise<Map<string, TreatmentOutcomeWeight>> {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const result = new Map<string, TreatmentOutcomeWeight>();

  try {
    // 농장 내 진단별 치료 결과 집계
    const rows = await db.execute(sql`
      SELECT
        he.diagnosis,
        COUNT(*)::int AS total_cases,
        COUNT(CASE WHEN (t.details->>'outcomeStatus') = 'recovered' THEN 1 END)::int AS recovered,
        COUNT(CASE WHEN (t.details->>'outcomeStatus') IN ('relapsed', 'worsened') THEN 1 END)::int AS failed
      FROM health_events he
      JOIN animals a ON a.animal_id = he.animal_id
      LEFT JOIN treatments t ON t.health_event_id = he.event_id
      WHERE a.farm_id = ${farmId}
        AND he.event_date >= ${cutoff}
      GROUP BY he.diagnosis
      HAVING COUNT(*) >= 1
    `);

    for (const row of rows as unknown as Array<{
      diagnosis: string;
      total_cases: number;
      recovered: number;
      failed: number;
    }>) {
      const recoveryRate = row.total_cases > 0 ? row.recovered / row.total_cases : 0;
      // 가중치: 빈도 보정(자주 발생 = 유병률 높음 → +) + 재발 보정(실패 많으면 → +, 잘 낫지 않는 질병)
      const frequencyBonus = Math.min(10, row.total_cases * 2);    // 최대 +10
      const failPenalty = row.failed >= 2 ? 5 : 0;                 // 실패 2건+ → 재발 의심 +5
      result.set(row.diagnosis, {
        diagnosis: row.diagnosis,
        totalCases: row.total_cases,
        recoveredCount: row.recovered,
        recoveryRate,
        weight: frequencyBonus + failPenalty,
      });
    }

    // 개체별 이전 진단 이력 (재발 가중치)
    const animalHistory = await db.execute(sql`
      SELECT he.diagnosis, COUNT(*)::int AS cnt
      FROM health_events he
      WHERE he.animal_id = ${animalId}
        AND he.event_date >= ${cutoff}
      GROUP BY he.diagnosis
    `);

    for (const row of animalHistory as unknown as Array<{ diagnosis: string; cnt: number }>) {
      const existing = result.get(row.diagnosis);
      if (existing && row.cnt >= 2) {
        // 같은 개체 재발 2회+ → 추가 가중치
        result.set(row.diagnosis, {
          ...existing,
          weight: existing.weight + 8,
        });
      }
    }
  } catch (error) {
    logger.debug({ error, farmId }, '[DiffDiag] 치료 결과 학습 실패 — 기본 가중치 사용');
  }

  return result;
}

// ── 근거 분류 ──

function classifyEvidence(
  metricType: string,
  currentAvg: number | null,
  expectedPattern: 'high' | 'low' | 'any',
): SensorEvidence {
  const range = NORMAL_RANGES[metricType];
  if (!range || currentAvg === null) {
    return { metric: metricType, currentValue: currentAvg, normalRange: '—', status: 'neutral' };
  }

  const isAboveNormal = currentAvg > range.max;
  const isBelowNormal = currentAvg < range.min;

  let status: SensorEvidence['status'] = 'neutral';
  if (expectedPattern === 'high' && isAboveNormal) status = 'supports';
  else if (expectedPattern === 'high' && !isAboveNormal) status = 'contradicts';
  else if (expectedPattern === 'low' && isBelowNormal) status = 'supports';
  else if (expectedPattern === 'low' && !isBelowNormal) status = 'contradicts';
  // 'any' → always neutral

  return { metric: metricType, currentValue: currentAvg, normalRange: range.label, status };
}

// ── 메인 함수 ──

export async function getDifferentialDiagnosis(
  animalId: string,
  symptoms?: readonly string[],
): Promise<DifferentialDiagnosisResult> {
  const db = getDb();

  // 동물 정보
  const [animal] = await db
    .select({
      animalId: animals.animalId,
      earTag: animals.earTag,
      farmId: animals.farmId,
      farmName: farms.name,
      parity: animals.parity,
      breedType: animals.breedType,
    })
    .from(animals)
    .innerJoin(farms, eq(animals.farmId, farms.farmId))
    .where(eq(animals.animalId, animalId))
    .limit(1);

  if (!animal) {
    return {
      animalId, earTag: '?', farmName: '?',
      candidates: [], farmHistory: [], similarCases: [],
      urgencyLevel: 'routine', dataQuality: 'insufficient',
    };
  }

  // 센서 데이터
  const sensorData = await loadSensorData(animalId);
  const dataQuality: DifferentialDiagnosisResult['dataQuality'] =
    sensorData.size >= 3 ? 'good' : sensorData.size >= 1 ? 'limited' : 'insufficient';

  // AX 학습: 과거 치료 결과 기반 가중치 (질병 루프 피드백)
  const outcomeWeights = await loadTreatmentOutcomeWeights(animal.farmId, animalId);

  // 각 질병 점수 계산
  const scored: { disease: string; score: number }[] = [];

  for (const [diseaseKey, profile] of Object.entries(DISEASE_PROFILES)) {
    let score = 0;
    let evidenceCount = 0;

    for (const [metric, expectedPattern] of Object.entries(profile.sensorPattern)) {
      const data = sensorData.get(metric);
      if (!data) continue;

      const range = NORMAL_RANGES[metric];
      if (!range) continue;

      evidenceCount++;
      if (expectedPattern === 'high' && data.avg > range.max) {
        score += 30;
      } else if (expectedPattern === 'low' && data.avg < range.min) {
        score += 25;
      } else if (expectedPattern === 'any') {
        score += 5; // 약한 기여
      }
    }

    // 기본 가중치 적용
    score = Math.round(score * profile.baseWeight);

    // 증상 보너스 (사용자가 입력한 임상 증상)
    if (symptoms) {
      const symptomBonus = symptoms.reduce((bonus, s) => {
        const lower = s.toLowerCase();
        if (diseaseKey === 'mastitis' && (lower.includes('유방') || lower.includes('유질') || lower.includes('부종'))) return bonus + 15;
        if (diseaseKey === 'ketosis' && (lower.includes('식욕') || lower.includes('케톤'))) return bonus + 15;
        if (diseaseKey === 'acidosis' && (lower.includes('설사') || lower.includes('산독'))) return bonus + 15;
        if (diseaseKey === 'pneumonia' && (lower.includes('기침') || lower.includes('호흡') || lower.includes('콧물'))) return bonus + 15;
        if (diseaseKey === 'metritis' && (lower.includes('분비물') || lower.includes('악취') || lower.includes('자궁'))) return bonus + 15;
        if (diseaseKey === 'lda' && (lower.includes('식욕') || lower.includes('핑음'))) return bonus + 15;
        return bonus;
      }, 0);
      score += symptomBonus;
    }

    // AX 학습 가중치: 농장·개체의 과거 치료 결과 반영
    // diagnosis 이름을 매칭 (profile.nameKo 또는 diseaseKey)
    const outcomeW = outcomeWeights.get(profile.nameKo) ?? outcomeWeights.get(diseaseKey);
    if (outcomeW) {
      score += outcomeW.weight;
    }

    if (score > 0 || evidenceCount > 0) {
      scored.push({ disease: diseaseKey, score: Math.min(score, 100) });
    }
  }

  // 확률 정규화
  const totalScore = scored.reduce((sum, s) => sum + s.score, 0);
  const candidates: DiagnosisCandidate[] = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => {
      const profile = DISEASE_PROFILES[s.disease]!;
      const probability = totalScore > 0 ? Math.round((s.score / totalScore) * 100) : 0;

      const evidence: SensorEvidence[] = Object.entries(profile.sensorPattern).map(([metric, pattern]) => {
        const data = sensorData.get(metric);
        return classifyEvidence(metric, data?.avg ?? null, pattern);
      });

      return {
        disease: s.disease,
        diseaseKo: profile.nameKo,
        probability,
        evidence,
        confirmatoryTests: profile.tests,
        matchingSymptoms: evidence.filter((e) => e.status === 'supports').map((e) => e.metric),
      };
    });

  // 농장 이력
  const farmHistory = await loadFarmHistory(animal.farmId);

  // 유사 센서 패턴 검색 (패턴 마이닝 기반)
  let similarCases: SimilarCase[] = [];
  try {
    const tempData = sensorData.get('temp');
    const rumData = sensorData.get('rum_index');
    const actData = sensorData.get('act');

    // 체온 추세 계산
    const tempValues = tempData?.values ?? [];
    const rumValues = rumData?.values ?? [];
    const tempTrend = tempValues.length >= 2
      ? (tempValues[0]! - tempValues[tempValues.length - 1]!) / (tempValues.length - 1)
      : null;
    const rumTrend = rumValues.length >= 2
      ? (rumValues[0]! - rumValues[rumValues.length - 1]!) / (rumValues.length - 1)
      : null;

    const similar = await findSimilarPatterns(
      {
        tempMean: tempData?.avg ?? null,
        rumMean: rumData ? rumData.avg / 60 : null,
        actMean: actData?.avg ?? null,
        tempTrend,
        rumTrend,
      },
      undefined, // 모든 이벤트 타입
      5,
    );

    similarCases = similar.map(p => ({
      eventType: p.eventType,
      eventDate: p.eventDetectedAt,
      similarity: Math.round(p.similarity * 100) / 100,
      sensorSummary: [
        p.beforeTempMean !== null ? `체온 ${p.beforeTempMean.toFixed(1)}°C` : null,
        p.beforeRumMean !== null ? `반추 ${p.beforeRumMean.toFixed(0)}분` : null,
        p.beforeActMean !== null ? `활동 ${p.beforeActMean.toFixed(0)}` : null,
      ].filter(Boolean).join(', '),
    }));
  } catch (err) {
    logger.debug({ err, animalId }, '[DiffDiag] 유사 패턴 검색 실패');
  }

  // 긴급도
  const topScore = scored.length > 0 ? scored[0]!.score : 0;
  const urgencyLevel: DifferentialDiagnosisResult['urgencyLevel'] =
    topScore >= 60 ? 'immediate' : topScore >= 30 ? 'within_24h' : 'routine';

  return {
    animalId,
    earTag: animal.earTag,
    farmName: animal.farmName,
    candidates,
    farmHistory,
    similarCases,
    urgencyLevel,
    dataQuality,
  };
}
