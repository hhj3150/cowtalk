// SEIR 역학 시뮬레이션
// S → E → I → R (감수성→노출→감염→회복)
// 질병별 파라미터: R0, 잠복기, 감염기간
// 이동제한 ON/OFF 비교 시나리오

import type { LegalDiseaseCode } from '../earlyDetection/disease-signature.db.js';

// ===========================
// 질병별 파라미터
// ===========================

interface DiseaseParams {
  readonly r0: number;            // 기초감염재생산수
  readonly incubationDays: number;
  readonly infectiousDays: number;
  readonly mortalityRate: number;  // 치사율
  readonly economicLossPerHead: number;  // 원 (두당 경제 손실)
}

const DISEASE_PARAMS: Record<LegalDiseaseCode, DiseaseParams> = {
  FMD: {
    r0: 10.0,
    incubationDays: 5,
    infectiousDays: 10,
    mortalityRate: 0.05,
    economicLossPerHead: 3_000_000,  // 300만원
  },
  BRUCELLOSIS: {
    r0: 2.5,
    incubationDays: 30,
    infectiousDays: 365,
    mortalityRate: 0.01,
    economicLossPerHead: 2_000_000,
  },
  TB: {
    r0: 1.8,
    incubationDays: 90,
    infectiousDays: 730,
    mortalityRate: 0.02,
    economicLossPerHead: 1_500_000,
  },
  BEF: {
    r0: 3.0,
    incubationDays: 5,
    infectiousDays: 7,
    mortalityRate: 0.005,
    economicLossPerHead: 500_000,
  },
  LSD: {
    r0: 4.0,
    incubationDays: 7,
    infectiousDays: 14,
    mortalityRate: 0.02,
    economicLossPerHead: 1_000_000,
  },
  ANTHRAX: {
    r0: 2.0,
    incubationDays: 3,
    infectiousDays: 3,
    mortalityRate: 0.8,
    economicLossPerHead: 5_000_000,
  },
} as const;

// ===========================
// 타입
// ===========================

export interface SEIRDay {
  readonly day: number;
  readonly S: number;   // 감수성 (두수)
  readonly E: number;   // 노출
  readonly I: number;   // 감염
  readonly R: number;   // 회복/제거
  readonly newInfections: number;
  readonly cumulativeInfections: number;
  readonly activeFarms: number;
  readonly economicLoss: number;  // 누적 경제 손실 (원)
}

export interface ScenarioResult {
  readonly label: string;
  readonly movementRestricted: boolean;
  readonly days: readonly SEIRDay[];
  readonly peakDay: number;
  readonly peakInfected: number;
  readonly totalInfected: number;
  readonly totalEconomicLoss: number;
  readonly extinctionDay: number | null;  // 종식 예상일
}

export interface SpreadSimulationResult {
  readonly diseaseCode: LegalDiseaseCode;
  readonly totalPopulation: number;
  readonly totalFarms: number;
  readonly initialInfected: number;
  readonly scenarios: readonly [ScenarioResult, ScenarioResult];  // [제한없음, 이동제한]
  readonly simulatedAt: string;
}

// ===========================
// SEIR 시뮬레이션
// ===========================

function runSEIR(params: {
  N: number;              // 총 두수
  totalFarms: number;
  initialInfected: number;
  diseaseCode: LegalDiseaseCode;
  movementRestricted: boolean;
  simulationDays: number;
}): SEIRDay[] {
  const disease = DISEASE_PARAMS[params.diseaseCode];
  const effectiveR0 = params.movementRestricted ? disease.r0 * 0.4 : disease.r0;

  const sigma = 1 / disease.incubationDays;  // 잠복기 역수
  const gamma = 1 / disease.infectiousDays;   // 감염기간 역수
  const beta = effectiveR0 * gamma;            // 전파율

  let S = params.N - params.initialInfected;
  let E = 0;
  let I = params.initialInfected;
  let R = 0;
  let cumulativeInfections = params.initialInfected;

  const days: SEIRDay[] = [];
  const avgAnimalsPerFarm = params.N / Math.max(params.totalFarms, 1);

  for (let day = 0; day <= params.simulationDays; day++) {
    const activeFarms = Math.min(
      Math.ceil(I / avgAnimalsPerFarm),
      params.totalFarms,
    );

    const economicLoss = Math.round(
      cumulativeInfections * disease.economicLossPerHead * disease.mortalityRate +
      I * disease.economicLossPerHead * 0.1,  // 치료비 등
    );

    const prevI = I;
    const dS = -(beta * S * I) / params.N;
    const dE = (beta * S * I) / params.N - sigma * E;
    const dI = sigma * E - gamma * I;
    const dR = gamma * I;

    S = Math.max(0, S + dS);
    E = Math.max(0, E + dE);
    I = Math.max(0, I + dI);
    R = Math.max(0, R + dR);

    const newInfections = Math.max(0, I - prevI + dR);
    cumulativeInfections += Math.max(0, newInfections);

    days.push({
      day,
      S: Math.round(S),
      E: Math.round(E),
      I: Math.round(I),
      R: Math.round(R),
      newInfections: Math.round(newInfections),
      cumulativeInfections: Math.round(cumulativeInfections),
      activeFarms,
      economicLoss,
    });

    if (I < 1 && E < 1 && day > 10) break;
  }

  return days;
}

function buildScenario(
  seirDays: readonly SEIRDay[],
  movementRestricted: boolean,
): ScenarioResult {
  const first = seirDays[0] ?? { I: 0, day: 0, S: 0, E: 0, R: 0, newInfections: 0, cumulativeInfections: 0, activeFarms: 0, economicLoss: 0 };
  const peakEntry = seirDays.reduce((max, d) => d.I > max.I ? d : max, first);
  const last = seirDays[seirDays.length - 1] ?? first;
  const extDay = seirDays.find((d, i) => i > 5 && d.I < 1 && d.E < 1);

  return {
    label: movementRestricted ? '이동제한 적용' : '이동제한 없음',
    movementRestricted,
    days: seirDays,
    peakDay: peakEntry.day,
    peakInfected: peakEntry.I,
    totalInfected: last.cumulativeInfections,
    totalEconomicLoss: last.economicLoss,
    extinctionDay: extDay?.day ?? null,
  };
}

// ===========================
// 메인: simulate
// ===========================

export function simulate(params: {
  diseaseCode: LegalDiseaseCode;
  totalPopulation: number;
  totalFarms: number;
  initialInfected?: number;
  simulationDays?: number;
}): SpreadSimulationResult {
  const initialInfected = params.initialInfected ?? 1;
  const simulationDays = params.simulationDays ?? 90;

  const baseParams = {
    N: params.totalPopulation,
    totalFarms: params.totalFarms,
    initialInfected,
    diseaseCode: params.diseaseCode,
    simulationDays,
  };

  const noRestrictionDays = runSEIR({ ...baseParams, movementRestricted: false });
  const restrictedDays = runSEIR({ ...baseParams, movementRestricted: true });

  return {
    diseaseCode: params.diseaseCode,
    totalPopulation: params.totalPopulation,
    totalFarms: params.totalFarms,
    initialInfected,
    scenarios: [
      buildScenario(noRestrictionDays, false),
      buildScenario(restrictedDays, true),
    ],
    simulatedAt: new Date().toISOString(),
  };
}
