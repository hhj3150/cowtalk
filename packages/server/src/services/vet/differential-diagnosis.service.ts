// 감별진단 서비스 — 센서 + v4 질병엔진 + 농장 이력 → 구조화 진단 결과
// 수의사가 납득할 근거 테이블 + 확률 순위 + 확인검사 트리 반환

import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { animals, healthEvents, sensorDailyAgg, farms } from '../../db/schema.js';

// ── 출력 타입 ──

export interface SensorEvidence {
  readonly metric: string;
  readonly currentValue: number | null;
  readonly normalRange: string;
  readonly status: 'supports' | 'contradicts' | 'neutral';
}

export interface DiagnosisCandidate {
  readonly disease: string;
  readonly diseaseKo: string;
  readonly probability: number;      // 0-100
  readonly evidence: readonly SensorEvidence[];
  readonly confirmatoryTests: readonly string[];
  readonly matchingSymptoms: readonly string[];
}

export interface FarmHistoryPattern {
  readonly diagnosis: string;
  readonly count: number;
}

export interface DifferentialDiagnosisResult {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmName: string;
  readonly candidates: readonly DiagnosisCandidate[];
  readonly farmHistory: readonly FarmHistoryPattern[];
  readonly urgencyLevel: 'immediate' | 'within_24h' | 'routine';
  readonly dataQuality: 'good' | 'limited' | 'insufficient';
}

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
      candidates: [], farmHistory: [],
      urgencyLevel: 'routine', dataQuality: 'insufficient',
    };
  }

  // 센서 데이터
  const sensorData = await loadSensorData(animalId);
  const dataQuality: DifferentialDiagnosisResult['dataQuality'] =
    sensorData.size >= 3 ? 'good' : sensorData.size >= 1 ? 'limited' : 'insufficient';

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
    urgencyLevel,
    dataQuality,
  };
}
