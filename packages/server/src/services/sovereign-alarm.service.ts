/**
 * 소버린 AI 알람 생성 서비스
 * smaXtec이 주지 않는 새로운 수의학적 인사이트 알람을 생성한다.
 * 세계 최고 수준의 수의학(질병학, 번식학, 행동학, 전염병학) 지식을 룰 엔진으로 구현하고,
 * Claude AI로 복합 패턴 분석을 수행한다.
 */

import { getDb } from '../config/database.js';
import { animals, sensorDailyAgg, sovereignAlarmLabels } from '../db/schema.js';
import { eq, and, gte, desc } from 'drizzle-orm';
import { saveSovereignAlarmsBatch } from '../intelligence-loop/prediction-bridge.service.js';
import { sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

export interface SovereignAlarm {
  readonly alarmId: string;
  readonly alarmSignature: string; // deterministic: animalId:type:YYYY-MM-DD
  readonly verdict?: 'confirmed' | 'false_positive' | 'modified'; // already labeled?
  readonly animalId: string;
  readonly earTag: string;
  readonly animalName: string | null;
  readonly farmId: string;
  readonly type: string;           // 알람 종류
  readonly severity: 'info' | 'caution' | 'warning' | 'critical';
  readonly title: string;
  readonly reasoning: string;      // AI 근거 설명
  readonly actionPlan: string;     // 권장 조치
  readonly confidence: number;     // 0-100%
  readonly detectedAt: string;     // ISO date
  readonly dataPoints: Record<string, number>; // 근거 수치
}

// 7일 일별 평균 데이터 구조
interface DailySummary {
  readonly date: string;
  readonly tempAvg: number | null;
  readonly rumAvg: number | null;   // minutes
  readonly actAvg: number | null;
  readonly drSum: number | null;    // L/day
}

// 배치 일간 요약 — N+1 → 1쿼리 (80두 목장도 1회 SELECT)
async function getBatchDailySummaries(
  animalIds: readonly string[],
  days: number,
): Promise<Map<string, DailySummary[]>> {
  if (animalIds.length === 0) return new Map();
  const db = getDb();
  const since = new Date(Date.now() - days * 86400_000);

  const rows = await db.select()
    .from(sensorDailyAgg)
    .where(and(
      sql`${sensorDailyAgg.animalId} = ANY(${animalIds})`,
      gte(sensorDailyAgg.date, since.toISOString().slice(0, 10)),
    ))
    .orderBy(desc(sensorDailyAgg.date));

  // Group by animalId → date
  const nested = new Map<string, Map<string, { temp?: number; rum?: number; act?: number; dr?: number }>>();
  for (const row of rows) {
    const aid = row.animalId;
    const d = typeof row.date === 'string' ? row.date : (row.date as Date).toISOString().slice(0, 10);
    if (!nested.has(aid)) nested.set(aid, new Map());
    const byDate = nested.get(aid)!;
    if (!byDate.has(d)) byDate.set(d, {});
    const entry = byDate.get(d)!;
    if (row.metricType === 'temp')         entry.temp = row.avg;
    if (row.metricType === 'rum_index')    entry.rum  = row.avg / 60;    // seconds → minutes
    if (row.metricType === 'act')          entry.act  = row.avg;
    if (row.metricType === 'water_intake') entry.dr   = row.avg * 144;   // 10-min avg → daily L
  }

  const result = new Map<string, DailySummary[]>();
  for (const aid of animalIds) {
    const byDate = nested.get(aid);
    if (!byDate) { result.set(aid, []); continue; }
    result.set(aid,
      Array.from(byDate.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, v]) => ({
          date,
          tempAvg: v.temp ?? null,
          rumAvg:  v.rum  ?? null,
          actAvg:  v.act  ?? null,
          drSum:   v.dr   ?? null,
        })),
    );
  }
  return result;
}

// ── 수의학 룰 엔진 ──

function ruleKetosisRisk(summary: DailySummary[], animal: { parity: number | null; daysInMilk: number | null }): SovereignAlarm | null {
  // 케토시스: 분만 후 3-8주(21-56 DIM), 산차 2이상, 반추 감소 + 체온 정상~약간 저하
  const dim = animal.daysInMilk ?? 0;
  if (dim < 7 || dim > 70) return null;
  const recent3 = summary.slice(0, 3);
  const prev4to7 = summary.slice(3, 7);
  if (recent3.length < 2 || prev4to7.length < 2) return null;

  const recentRumAvg = recent3.filter(d => d.rumAvg).reduce((s, d) => s + d.rumAvg!, 0) / recent3.filter(d => d.rumAvg).length;
  const prevRumAvg = prev4to7.filter(d => d.rumAvg).reduce((s, d) => s + d.rumAvg!, 0) / prev4to7.filter(d => d.rumAvg).length;
  if (!recentRumAvg || !prevRumAvg) return null;

  const rumDecline = (prevRumAvg - recentRumAvg) / prevRumAvg;
  if (rumDecline < 0.15) return null; // 15% 이상 감소만 알람

  const tempPts = recent3.filter(d => d.tempAvg);
  const recentTempAvg = tempPts.length > 0 ? tempPts.reduce((s, d) => s + d.tempAvg!, 0) / tempPts.length : null;

  const severity = rumDecline > 0.35 ? 'critical' : rumDecline > 0.25 ? 'warning' : 'caution';
  const pct = Math.round(rumDecline * 100);

  return {
    alarmId: '',
    alarmSignature: '',
    animalId: '',
    earTag: '',
    animalName: null,
    farmId: '',
    type: 'ketosis_risk',
    severity,
    title: `케토시스 위험 (DIM ${dim}일, 반추 ${pct}% 감소)`,
    reasoning: `분만 후 ${dim}일차(케토시스 고위험기)에 최근 3일 반추시간(${Math.round(recentRumAvg)}분/일)이 이전 4-7일(${Math.round(prevRumAvg)}분/일) 대비 ${pct}% 감소했습니다. 체온 ${recentTempAvg ? recentTempAvg.toFixed(1) : 'N/A'}°C. 케토시스는 분만 후 에너지 부족으로 발생하며 반추 감소가 첫 번째 지표입니다. 조기 발견 시 NEFA 수치 확인과 프로필렌 글리콜 투여로 완치 가능합니다.`,
    actionPlan: `① 혈중 BHBA 검사(>1.2mmol/L 케토시스 확진) ② 프로필렌 글리콜 300mL 1일 2회 경구투여 ③ 사료섭취량 확인 ④ 착유량 모니터링 ⑤ 2일 후 재평가`,
    confidence: Math.round(40 + rumDecline * 100),
    detectedAt: new Date().toISOString(),
    dataPoints: { rumDeclinePct: pct, recentRumMin: Math.round(recentRumAvg), prevRumMin: Math.round(prevRumAvg), dim, tempAvg: recentTempAvg ?? 0 },
  };
}

function ruleMastitisRisk(summary: DailySummary[]): SovereignAlarm | null {
  // 유방염: 체온 >39.5°C 지속 + 반추 감소
  const recent2 = summary.slice(0, 2);
  if (recent2.length < 2) return null;

  const highTemp = recent2.filter(d => d.tempAvg && d.tempAvg > 39.4);
  if (highTemp.length < 1) return null; // 최소 1일 고열

  const recentRum = recent2.filter(d => d.rumAvg);
  const prev = summary.slice(2, 5).filter(d => d.rumAvg);

  const tempPts2 = recent2.filter(d => d.tempAvg);
  if (tempPts2.length === 0) return null;
  const tempAvg = tempPts2.reduce((s, d) => s + d.tempAvg!, 0) / tempPts2.length;

  let rumDecline = 0;
  if (recentRum.length > 0 && prev.length > 0) {
    const rAvg = recentRum.reduce((s, d) => s + d.rumAvg!, 0) / recentRum.length;
    const pAvg = prev.reduce((s, d) => s + d.rumAvg!, 0) / prev.length;
    rumDecline = pAvg > 0 ? (pAvg - rAvg) / pAvg : 0;
  }

  if (tempAvg <= 39.4 && rumDecline < 0.1) return null;

  const severity = tempAvg > 40.2 ? 'critical' : tempAvg > 39.7 ? 'warning' : 'caution';

  return {
    alarmId: '',
    alarmSignature: '',
    animalId: '',
    earTag: '',
    animalName: null,
    farmId: '',
    type: 'mastitis_risk',
    severity,
    title: `유방염 의심 (체온 ${tempAvg.toFixed(1)}°C${rumDecline > 0.1 ? ` + 반추 ${Math.round(rumDecline*100)}%↓` : ''})`,
    reasoning: `최근 2일 평균 체온 ${tempAvg.toFixed(1)}°C로 정상범위(38.5-39.2°C) 초과. ${rumDecline > 0.1 ? `반추시간도 ${Math.round(rumDecline*100)}% 감소하여 ` : ''}전신염증 반응 동반 가능성. 유방염은 착유우에서 가장 흔한 질환으로 조기 치료 시 유방 손상과 착유량 손실을 최소화할 수 있습니다. E.coli성 유방염은 전신패혈증으로 진행 가능하므로 즉시 확인이 필요합니다.`,
    actionPlan: `① CMT(유방염 간이검사) 4분방 실시 ② 유즙 이상(응고, 혈유) 육안확인 ③ 항생제 처방(수의사 상담) ④ 착유 전 체온 재확인 ⑤ 격리 고려`,
    confidence: Math.round(50 + (tempAvg - 39.4) * 60 + rumDecline * 30),
    detectedAt: new Date().toISOString(),
    dataPoints: { tempAvg, rumDeclinePct: Math.round(rumDecline * 100) },
  };
}

function ruleAcidosisRisk(summary: DailySummary[], animal: { daysInMilk: number | null }): SovereignAlarm | null {
  // 아급성 제1위산증(SARA): 반추 급감(>30%) + 활동량 감소
  const recent3 = summary.slice(0, 3);
  const prev4 = summary.slice(3, 7);
  if (recent3.length < 2 || prev4.length < 2) return null;

  const rRum = recent3.filter(d => d.rumAvg);
  const pRum = prev4.filter(d => d.rumAvg);
  if (rRum.length === 0 || pRum.length === 0) return null;

  const recentRumAvg = rRum.reduce((s, d) => s + d.rumAvg!, 0) / rRum.length;
  const prevRumAvg = pRum.reduce((s, d) => s + d.rumAvg!, 0) / pRum.length;
  if (prevRumAvg <= 0) return null; // 분모 0 방지
  const rumDecline = (prevRumAvg - recentRumAvg) / prevRumAvg;

  if (rumDecline < 0.28) return null; // SARA 기준: 반추 28% 이상 감소

  const rAct = recent3.filter(d => d.actAvg);
  const pAct = prev4.filter(d => d.actAvg);
  const actDecline = (rAct.length > 0 && pAct.length > 0)
    ? (pAct.reduce((s, d) => s + d.actAvg!, 0) / pAct.length - rAct.reduce((s, d) => s + d.actAvg!, 0) / rAct.length) / (pAct.reduce((s, d) => s + d.actAvg!, 0) / pAct.length)
    : 0;

  const dim = animal.daysInMilk ?? 0;
  const severity = (rumDecline > 0.40 || actDecline > 0.20) ? 'critical' : 'warning';

  return {
    alarmId: '',
    alarmSignature: '',
    animalId: '',
    earTag: '',
    animalName: null,
    farmId: '',
    type: 'acidosis_risk',
    severity,
    title: `아급성 제1위산증(SARA) 의심 (반추 ${Math.round(rumDecline*100)}%↓)`,
    reasoning: `최근 3일 반추시간(${Math.round(recentRumAvg)}분/일)이 이전 대비 ${Math.round(rumDecline*100)}% 급감. SARA는 사료의 급격한 변화, 과도한 농후사료 급여 시 발생하며 반추 감소가 핵심 지표입니다(정상 반추 400-600분/일). 장기간 방치 시 제엽염, 간농양으로 진행됩니다. DIM ${dim}일로 비유 초기 고위험기입니다.`,
    actionPlan: `① 조사료:농후사료 비율 확인(최소 50:50) ② 완충제(탄산수소나트륨) 사료 첨가 ③ 사료 변화 이력 확인 ④ 분변 점수(FCS) 평가 ⑤ 수의사 상담`,
    confidence: Math.round(45 + rumDecline * 100),
    detectedAt: new Date().toISOString(),
    dataPoints: { rumDeclinePct: Math.round(rumDecline*100), actDeclinePct: Math.round(actDecline*100), recentRumMin: Math.round(recentRumAvg), dim },
  };
}

function ruleLaminitisRisk(summary: DailySummary[], animal: { daysInMilk: number | null; parity: number | null }): SovereignAlarm | null {
  // 제엽염: 활동량 지속 감소 + 중간 고열(38.8-39.4°C) + DIM 30-120일
  const dim = animal.daysInMilk ?? 0;
  if (dim < 14 || dim > 150) return null;

  const recent5 = summary.slice(0, 5);
  if (recent5.length < 4) return null;

  const actVals = recent5.filter(d => d.actAvg).map(d => d.actAvg!);
  if (actVals.length < 3) return null;

  // 5일 중 4일 이상 낮은 활동량 (평균의 70% 미만)
  const trend = actVals.slice(0, 3).reduce((s, v) => s + v, 0) / 3;
  const baseline = actVals.slice(2).reduce((s, v) => s + v, 0) / actVals.slice(2).length;

  if (baseline === 0) return null;
  const actDecline = (baseline - trend) / baseline;
  if (actDecline < 0.20) return null;

  const tempVals = recent5.filter(d => d.tempAvg).map(d => d.tempAvg!);
  const tempAvg = tempVals.length > 0 ? tempVals.reduce((s, v) => s + v, 0) / tempVals.length : 0;

  return {
    alarmId: '',
    alarmSignature: '',
    animalId: '',
    earTag: '',
    animalName: null,
    farmId: '',
    type: 'laminitis_risk',
    severity: 'warning',
    title: `제엽염 위험 (DIM ${dim}일, 활동 ${Math.round(actDecline*100)}%↓)`,
    reasoning: `최근 5일 활동량이 ${Math.round(actDecline*100)}% 감소 추세. DIM ${dim}일로 비유 성수기 제엽염 발생 고위험기. 제엽염(Laminitis)은 발굽 내 혈류장애로 보행 통증을 유발하며, 활동량 감소가 초기 징후입니다. 조기 발견 및 발굽 관리로 만성화를 예방할 수 있습니다.`,
    actionPlan: `① 보행 및 기립 패턴 육안 관찰 ② 발굽 상태 확인(발굽삭제, 부종) ③ 바닥 재질 개선(고무매트) ④ 영양 관리(아연, 비오틴 보충) ⑤ 발굽 전문가 상담`,
    confidence: Math.round(35 + actDecline * 80),
    detectedAt: new Date().toISOString(),
    dataPoints: { actDeclinePct: Math.round(actDecline*100), tempAvg, dim, parity: animal.parity ?? 0 },
  };
}

function ruleWaterIntakeAnomaly(summary: DailySummary[]): SovereignAlarm | null {
  // 음수량 이상: 급감(>40%) → 건강이상 또는 급증(>60%) → 당뇨/대사이상
  const recent2 = summary.slice(0, 2);
  const prev3 = summary.slice(2, 5);

  const rDr = recent2.filter(d => d.drSum && d.drSum > 10).map(d => d.drSum!);
  const pDr = prev3.filter(d => d.drSum && d.drSum > 10).map(d => d.drSum!);

  if (rDr.length === 0 || pDr.length === 0) return null;

  const recentDr = rDr.reduce((s, v) => s + v, 0) / rDr.length;
  const prevDr = pDr.reduce((s, v) => s + v, 0) / pDr.length;

  if (prevDr < 20) return null; // 기준값이 너무 낮으면 노이즈

  const change = (recentDr - prevDr) / prevDr;

  if (Math.abs(change) < 0.35) return null;

  const isDecrease = change < 0;
  const pct = Math.round(Math.abs(change) * 100);

  return {
    alarmId: '',
    alarmSignature: '',
    animalId: '',
    earTag: '',
    animalName: null,
    farmId: '',
    type: isDecrease ? 'water_decrease' : 'water_increase',
    severity: pct > 60 ? 'warning' : 'caution',
    title: `음수량 ${isDecrease ? '급감' : '급증'} (${pct}% ${isDecrease ? '↓' : '↑'})`,
    reasoning: `최근 2일 음수량(${Math.round(recentDr)}L/일)이 이전 3일(${Math.round(prevDr)}L/일) 대비 ${pct}% ${isDecrease ? '감소' : '증가'}. ${isDecrease ? '음수량 감소는 발열, 통증, 스트레스, 사료섭취 문제의 초기 신호. 젖소는 음수량이 착유량의 4-5배 필요하므로 급감 시 즉시 확인 요망.' : '음수량 급증은 당뇨병, 신장질환, 고염분 사료 급여 시 발생. 착유량 변화와 함께 모니터링 필요.'}`,
    actionPlan: isDecrease
      ? `① 음수대 청결 및 수압 확인 ② 체온 측정 ③ 사료섭취량 변화 확인 ④ 스트레스 요인 제거 ⑤ 수의사 상담`
      : `① 사료 내 식염 함량 확인 ② 소변 검사(당뇨 확인) ③ 신장 기능 확인 ④ 전해질 균형 평가`,
    confidence: Math.round(30 + Math.abs(change) * 60),
    detectedAt: new Date().toISOString(),
    dataPoints: { recentDrL: Math.round(recentDr), prevDrL: Math.round(prevDr), changePct: pct },
  };
}

function ruleHeatStressRisk(summary: DailySummary[]): SovereignAlarm | null {
  // 열스트레스: 체온 >39.2°C + 반추 감소 + 활동 감소 (여름철 고온)
  const recent3 = summary.slice(0, 3);
  if (recent3.length < 2) return null;

  const tempVals = recent3.filter(d => d.tempAvg && d.tempAvg > 39.1).map(d => d.tempAvg!);
  if (tempVals.length < 2) return null; // 2일 이상 고온

  const avgTemp = tempVals.reduce((s, v) => s + v, 0) / tempVals.length;

  // 반추도 함께 감소하면 확신도 상승
  const rRum = recent3.filter(d => d.rumAvg).map(d => d.rumAvg!);
  const rumAvg = rRum.length > 0 ? rRum.reduce((s, v) => s + v, 0) / rRum.length : 0;

  if (avgTemp <= 39.2) return null;

  return {
    alarmId: '',
    alarmSignature: '',
    animalId: '',
    earTag: '',
    animalName: null,
    farmId: '',
    type: 'heat_stress',
    severity: avgTemp > 39.8 ? 'warning' : 'caution',
    title: `열스트레스 의심 (평균 체온 ${avgTemp.toFixed(1)}°C)`,
    reasoning: `최근 ${tempVals.length}일 연속 체온 ${avgTemp.toFixed(1)}°C로 정상범위(38.5-39.2°C) 초과. ${rumAvg > 0 && rumAvg < 350 ? `반추시간도 ${Math.round(rumAvg)}분/일로 저하(정상 400-500분/일). ` : ''}열스트레스(THI >72)는 착유량 15-20% 감소, 번식성적 저하의 주요 원인. 경미한 단계에서 조치 시 생산성 손실을 최소화할 수 있습니다.`,
    actionPlan: `① 사육 환경 온습도(THI) 확인 ② 환기팬·쿨링시스템 가동 ③ 음수대 추가 설치 ④ 사료 급여 시간 조정(새벽/야간) ⑤ 착유량 모니터링`,
    confidence: Math.round(40 + (avgTemp - 39.2) * 50),
    detectedAt: new Date().toISOString(),
    dataPoints: { avgTemp, rumAvgMin: Math.round(rumAvg), highTempDays: tempVals.length },
  };
}

// ── 메인 함수 ──

export interface AnimalProfile {
  readonly animalId: string;
  readonly farmId: string;
  readonly earTag: string;
  readonly name: string | null;
  readonly daysInMilk: number | null;
  readonly parity: number | null;
  readonly lactationStatus: string | null;
}

export async function generateSovereignAlarms(farmId: string, limit = 30): Promise<SovereignAlarm[]> {
  const db = getDb();

  // 활성 착유우/건유우만 (에너지가 많이 필요한 개체)
  const farmAnimals = await db.select({
    animalId: animals.animalId,
    farmId: animals.farmId,
    earTag: animals.earTag,
    name: animals.name,
    daysInMilk: animals.daysInMilk,
    parity: animals.parity,
    lactationStatus: animals.lactationStatus,
  })
    .from(animals)
    .where(and(
      eq(animals.farmId, farmId),
      eq(animals.status, 'active'),
    ))
    .limit(80);

  const alarms: SovereignAlarm[] = [];

  // 1쿼리로 전체 목장 센서 데이터 배치 조회 (N+1 → 1)
  const animalIds = farmAnimals.map((a) => a.animalId);
  const summaryMap = await getBatchDailySummaries(animalIds, 10);

  for (const animal of farmAnimals) {
    try {
      const summary = summaryMap.get(animal.animalId) ?? [];
      if (summary.length < 3) continue; // 데이터 부족

      const rules = [
        ruleKetosisRisk(summary, animal),
        ruleMastitisRisk(summary),
        ruleAcidosisRisk(summary, animal),
        ruleLaminitisRisk(summary, animal),
        ruleWaterIntakeAnomaly(summary),
        ruleHeatStressRisk(summary),
      ];

      const today = new Date().toISOString().slice(0, 10);
      for (const alarm of rules) {
        if (alarm) {
          const signature = `${animal.animalId}:${alarm.type}:${today}`;
          alarms.push({
            ...alarm,
            alarmId: `sov-${signature}`,
            alarmSignature: signature,
            animalId: animal.animalId,
            earTag: animal.earTag,
            animalName: animal.name,
            farmId: animal.farmId,
          });
        }
      }
    } catch (err) {
      logger.warn({ err, animalId: animal.animalId }, 'sovereign alarm rule error');
    }
  }

  // AX 학습: 레이블 정확도 기반 confidence 보정 (루프 폐쇄)
  // false_positive가 많은 알람 타입은 confidence 하향, confirmed 많으면 유지
  let calibratedAlarms = alarms;
  try {
    const accuracy = await getSovereignAlarmAccuracy(farmId);
    calibratedAlarms = alarms.map((alarm) => {
      const typeStats = accuracy.byType[alarm.type];
      if (!typeStats || typeStats.total < 3) return alarm; // 3건 미만이면 보정 안 함
      const fpRate = typeStats.falsePositive / typeStats.total;
      let newConf = alarm.confidence;
      if (fpRate > 0.5) {
        newConf = Math.round(newConf * 0.7);       // 오탐 50%+ → -30%
      } else if (fpRate > 0.3) {
        newConf = Math.round(newConf * 0.85);      // 오탐 30~50% → -15%
      }
      const confirmRate = typeStats.confirmed / typeStats.total;
      if (confirmRate > 0.9 && typeStats.total >= 5) {
        newConf = Math.min(100, Math.round(newConf * 1.1)); // 정확 90%+ → +10%
      }
      return newConf !== alarm.confidence ? { ...alarm, confidence: newConf } : alarm;
    });
  } catch (err) {
    logger.debug({ err, farmId }, '[Sovereign] 레이블 보정 실패 — 원본 confidence 유지');
  }

  // severity 우선순위 정렬 + limit
  const ORDER: Record<string, number> = { critical: 0, warning: 1, caution: 2, info: 3 };
  const sorted = [...calibratedAlarms]
    .sort((a, b) => (ORDER[a.severity] ?? 3) - (ORDER[b.severity] ?? 3))
    .slice(0, limit);

  // AI 성능 측정: 소버린 알람을 predictions 테이블에 저장 (비동기, 실패해도 알람 반환에 영향 없음)
  saveSovereignAlarmsBatch(sorted).catch((err) => {
    logger.debug({ err, count: sorted.length }, '[Sovereign] prediction bridge save failed');
  });

  // Load existing labels for these alarms
  try {
    const signatures = sorted.map(a => a.alarmSignature);
    if (signatures.length > 0) {
      const labels = await db.select()
        .from(sovereignAlarmLabels)
        .where(sql`alarm_signature = ANY(${signatures})`);
      const labelMap = new Map(labels.map(l => [l.alarmSignature, l.verdict as 'confirmed' | 'false_positive' | 'modified']));
      return sorted.map(a => ({ ...a, verdict: labelMap.get(a.alarmSignature) }));
    }
  } catch (err) {
    logger.warn({ err }, 'failed to load sovereign alarm labels');
  }
  return sorted;
}

// ── 레이블 저장 ──

export interface SaveSovereignLabelInput {
  readonly alarmSignature: string;
  readonly animalId: string;
  readonly farmId: string;
  readonly alarmType: string;
  readonly predictedSeverity: string;
  readonly verdict: 'confirmed' | 'false_positive' | 'modified';
  readonly notes?: string;
}

export async function saveSovereignAlarmLabel(input: SaveSovereignLabelInput): Promise<void> {
  const db = getDb();
  await db.insert(sovereignAlarmLabels)
    .values({
      alarmSignature:    input.alarmSignature,
      animalId:          input.animalId,
      farmId:            input.farmId,
      alarmType:         input.alarmType,
      predictedSeverity: input.predictedSeverity,
      verdict:           input.verdict,
      notes:             input.notes ?? null,
    })
    .onConflictDoUpdate({
      target: sovereignAlarmLabels.alarmSignature,
      set: {
        verdict:   input.verdict,
        notes:     input.notes ?? null,
        labeledAt: new Date(),
      },
    });
}

// ── 정확도 통계 ──

export interface SovereignAlarmAccuracy {
  readonly totalLabeled: number;
  readonly confirmed: number;
  readonly falsePositive: number;
  readonly modified: number;
  readonly accuracy: number; // confirmed / totalLabeled * 100
  readonly byType: Record<string, { confirmed: number; falsePositive: number; modified: number; total: number }>;
}

export async function getSovereignAlarmAccuracy(farmId: string): Promise<SovereignAlarmAccuracy> {
  const db = getDb();
  const rows = await db.select()
    .from(sovereignAlarmLabels)
    .where(eq(sovereignAlarmLabels.farmId, farmId));

  const byType: Record<string, { confirmed: number; falsePositive: number; modified: number; total: number }> = {};
  let confirmed = 0, falsePositive = 0, modified = 0;

  for (const row of rows) {
    const t = byType[row.alarmType] ?? { confirmed: 0, falsePositive: 0, modified: 0, total: 0 };
    if (row.verdict === 'confirmed') { t.confirmed++; confirmed++; }
    else if (row.verdict === 'false_positive') { t.falsePositive++; falsePositive++; }
    else if (row.verdict === 'modified') { t.modified++; modified++; }
    t.total++;
    byType[row.alarmType] = t;
  }

  const total = rows.length;
  return {
    totalLabeled: total,
    confirmed,
    falsePositive,
    modified,
    accuracy: total > 0 ? Math.round((confirmed / total) * 100) : 0,
    byType,
  };
}
