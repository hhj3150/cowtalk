// 번식 파이프라인 서비스 — 칸반 뷰 데이터 + KPI 산출
// 6단계: open → estrus_detected → inseminated → pregnancy_confirmed → late_gestation → calving_expected
// 실 DB 데이터(smaxtecEvents + breedingEvents + pregnancyChecks) 기반

import { getDb } from '../../config/database.js';
import { animals, farms, smaxtecEvents, breedingEvents, pregnancyChecks, calvingEvents } from '../../db/schema.js';
import { eq, and, desc, gte, inArray, isNull } from 'drizzle-orm';
import { getFarmBreedingSettings } from './farm-settings-sync.service.js';
import { logger } from '../../lib/logger.js';
import type {
  BreedingPipelineData,
  BreedingStage,
  BreedingStageGroup,
  BreedingAnimalSummary,
  BreedingKpis,
  BreedingUrgentAction,
  CalendarEvent,
  CalendarEventType,
} from '@cowtalk/shared';

// ===========================
// 상수
// ===========================

const STAGE_LABELS: Readonly<Record<BreedingStage, string>> = {
  open: '공태 (미수정)',
  estrus_detected: '발정 감지',
  inseminated: '수정 완료',
  pregnancy_confirmed: '임신 확인',
  late_gestation: '임신 후기',
  calving_expected: '분만 예정',
};

const BREEDING_EVENT_TYPES = [
  'estrus', 'heat', 'insemination', 'pregnancy_check',
  'calving', 'calving_detection', 'calving_confirmation',
  'dry_off', 'no_insemination', 'abortion',
] as const;

const MS_PER_DAY = 86_400_000;

// 같은 분만이 calving_detection + calving_confirmation 쌍으로 기록되거나
// calvingEvents 테이블에도 중복 저장될 수 있어, 60일 이내는 동일 분만으로 병합
// (실제 분만간격 최소값은 임신기간 280일이므로 60일 임계값은 안전)
export const CALVING_DEDUP_WINDOW_DAYS = 60;

export function dedupCalvingDates(dates: readonly Date[]): Date[] {
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const merged: Date[] = [];
  for (const d of sorted) {
    const last = merged[merged.length - 1];
    if (!last || (d.getTime() - last.getTime()) / MS_PER_DAY > CALVING_DEDUP_WINDOW_DAYS) {
      merged.push(d);
    }
  }
  return merged;
}

// ===========================
// 메인: getBreedingPipeline
// ===========================

export async function getBreedingPipeline(farmId?: string): Promise<BreedingPipelineData> {
  const db = getDb();
  const now = new Date();
  const since365d = new Date(now.getTime() - 365 * MS_PER_DAY);

  // 1. 활성 암소 조회
  const animalConditions = [
    eq(animals.status, 'active'),
    isNull(animals.deletedAt),
  ];
  if (farmId) {
    animalConditions.push(eq(animals.farmId, farmId));
  }

  const allAnimals = await db
    .select({
      animalId: animals.animalId,
      earTag: animals.earTag,
      farmId: animals.farmId,
      parity: animals.parity,
      birthDate: animals.birthDate,
      sex: animals.sex,
    })
    .from(animals)
    .where(and(...animalConditions));

  // 암소만 (sex가 null이면 포함 — smaXtec에서 성별 미입력 가능)
  const femaleAnimals = allAnimals.filter((a) => a.sex !== 'male');

  // 농장명 조회
  const farmIds = [...new Set(femaleAnimals.map((a) => a.farmId))];
  const farmRows = farmIds.length > 0
    ? await db
        .select({ farmId: farms.farmId, name: farms.name })
        .from(farms)
        .where(inArray(farms.farmId, farmIds))
    : [];
  const farmNameMap = new Map(farmRows.map((f) => [f.farmId, f.name]));

  // 2. 각 개체의 최근 번식 이벤트 조회 (smaxtecEvents 기반)
  const animalIds = femaleAnimals.map((a) => a.animalId);

  const recentEvents = animalIds.length > 0
    ? await db
        .select({
          animalId: smaxtecEvents.animalId,
          eventType: smaxtecEvents.eventType,
          detectedAt: smaxtecEvents.detectedAt,
          details: smaxtecEvents.details,
        })
        .from(smaxtecEvents)
        .where(
          and(
            inArray(smaxtecEvents.animalId, animalIds),
            inArray(smaxtecEvents.eventType, [...BREEDING_EVENT_TYPES]),
            gte(smaxtecEvents.detectedAt, since365d),
          ),
        )
        .orderBy(desc(smaxtecEvents.detectedAt))
    : [];

  // 개체별 이벤트 그룹핑
  const eventsByAnimal = new Map<string, typeof recentEvents>();
  for (const evt of recentEvents) {
    const list = eventsByAnimal.get(evt.animalId) ?? [];
    list.push(evt);
    eventsByAnimal.set(evt.animalId, list);
  }

  // 3. 임신감정 결과 — smaXtec 이벤트(pregnancy_check) 우선, 수동 입력(pregnancyChecks) 보완
  const manualPregnancies = animalIds.length > 0
    ? await db
        .select({
          animalId: pregnancyChecks.animalId,
          result: pregnancyChecks.result,
          checkDate: pregnancyChecks.checkDate,
        })
        .from(pregnancyChecks)
        .where(inArray(pregnancyChecks.animalId, animalIds))
        .orderBy(desc(pregnancyChecks.checkDate))
    : [];

  // smaXtec pregnancy_check 이벤트에서 임신 여부 추출 (details.pregnant = true/false)
  const pregnancyResults: { animalId: string; result: string; checkDate: Date }[] = [];
  for (const evt of recentEvents) {
    if (evt.eventType !== 'pregnancy_check') continue;
    const details = evt.details as Record<string, unknown> | null;
    const pregnant = details?.pregnant;
    if (pregnant === true) {
      pregnancyResults.push({ animalId: evt.animalId, result: 'pregnant', checkDate: new Date(evt.detectedAt) });
    } else if (pregnant === false) {
      pregnancyResults.push({ animalId: evt.animalId, result: 'open', checkDate: new Date(evt.detectedAt) });
    }
  }
  // 수동 입력 보완 (중복 없이 추가)
  for (const p of manualPregnancies) {
    pregnancyResults.push({ animalId: p.animalId, result: p.result, checkDate: new Date(p.checkDate) });
  }

  // 최신 순 정렬 후 개체별 Map 구성
  pregnancyResults.sort((a, b) => b.checkDate.getTime() - a.checkDate.getTime());
  const pregnancyByAnimal = new Map<string, typeof pregnancyResults>();
  for (const p of pregnancyResults) {
    const list = pregnancyByAnimal.get(p.animalId) ?? [];
    list.push(p);
    pregnancyByAnimal.set(p.animalId, list);
  }

  // 4. 분만 이력 — smaXtec 'calving'/'calving_confirmation' 이벤트 + calvingEvents 테이블 병합
  // 분만간격은 정상 380~420일이므로 365일 윈도우로는 2회 분만을 포착 불가 → 1095일(3년) 별도 조회
  const calvingByAnimal = new Map<string, Date[]>();
  const since1095d = new Date(now.getTime() - 1095 * MS_PER_DAY);

  const calvingEventsWide = animalIds.length > 0
    ? await db
        .select({
          animalId: smaxtecEvents.animalId,
          eventType: smaxtecEvents.eventType,
          detectedAt: smaxtecEvents.detectedAt,
        })
        .from(smaxtecEvents)
        .where(
          and(
            inArray(smaxtecEvents.animalId, animalIds),
            inArray(smaxtecEvents.eventType, ['calving', 'calving_confirmation', 'calving_detection']),
            gte(smaxtecEvents.detectedAt, since1095d),
          ),
        )
    : [];

  for (const evt of calvingEventsWide) {
    const list = calvingByAnimal.get(evt.animalId) ?? [];
    calvingByAnimal.set(evt.animalId, [...list, new Date(evt.detectedAt)]);
  }

  // calvingEvents 테이블 보완 (수동 기록)
  if (animalIds.length > 0) {
    const manualCalvings = await db
      .select({ animalId: calvingEvents.animalId, calvingDate: calvingEvents.calvingDate })
      .from(calvingEvents)
      .where(inArray(calvingEvents.animalId, animalIds))
      .orderBy(desc(calvingEvents.calvingDate));
    for (const c of manualCalvings) {
      if (!c.calvingDate) continue;
      const list = calvingByAnimal.get(c.animalId) ?? [];
      calvingByAnimal.set(c.animalId, [...list, c.calvingDate]);
    }
  }

  // 5. 수정 이벤트 — smaXtec 'insemination' 이벤트 + breedingEvents 테이블 병합
  const inseminationsByAnimal = new Map<string, Date[]>();

  // smaXtec 이벤트에서 수정 날짜 추출
  for (const evt of recentEvents) {
    if (evt.eventType !== 'insemination') continue;
    const list = inseminationsByAnimal.get(evt.animalId) ?? [];
    inseminationsByAnimal.set(evt.animalId, [...list, new Date(evt.detectedAt)]);
  }

  // breedingEvents 테이블 보완 (CowTalk 수동 기록)
  const cwBreedingEvents = animalIds.length > 0
    ? await db
        .select({ animalId: breedingEvents.animalId, type: breedingEvents.type, eventDate: breedingEvents.eventDate })
        .from(breedingEvents)
        .where(and(inArray(breedingEvents.animalId, animalIds), gte(breedingEvents.eventDate, since365d)))
    : [];
  for (const e of cwBreedingEvents) {
    if (e.type !== 'insemination' || !e.eventDate) continue;
    const list = inseminationsByAnimal.get(e.animalId) ?? [];
    inseminationsByAnimal.set(e.animalId, [...list, e.eventDate]);
  }

  // 6. 단계 판별 + 요약 생성
  const settings = farmId ? await getFarmBreedingSettings(farmId) : null;
  const gestationDays = settings?.gestationDays ?? 280;
  const pregnancyCheckDays = settings?.pregnancyCheckDays ?? 28;

  const summaries: BreedingAnimalSummary[] = [];
  const urgentActions: BreedingUrgentAction[] = [];

  for (const animal of femaleAnimals) {
    const events = eventsByAnimal.get(animal.animalId) ?? [];
    const pregnancies = pregnancyByAnimal.get(animal.animalId) ?? [];
    const latestEvent = events[0];
    const farmName = farmNameMap.get(animal.farmId) ?? '미상';

    // 단계 판별
    const { stage, lastEventDate, daysInStage } = determineStage(
      latestEvent,
      pregnancies[0],
      gestationDays,
      now,
    );

    // 긴급도 계산
    const urgency = calcUrgency(stage, daysInStage, events);

    // smaXtec 발정 감지 여부 (최근 7일)
    const recentEstrus = events.some(
      (e) => (e.eventType === 'estrus' || e.eventType === 'heat') &&
        (now.getTime() - new Date(e.detectedAt).getTime()) < 7 * MS_PER_DAY,
    );

    summaries.push({
      animalId: animal.animalId,
      earTag: animal.earTag,
      farmId: animal.farmId,
      farmName,
      currentStage: stage,
      lastEventDate: lastEventDate ?? now.toISOString(),
      daysInStage,
      lactationNumber: animal.parity ?? 0,
      smaxtecEstrusDetected: recentEstrus,
      urgency,
    });

    // 긴급 조치 도출
    const action = deriveUrgentAction(animal, stage, daysInStage, events, farmName, pregnancyCheckDays, now);
    if (action) urgentActions.push(action);
  }

  // 6. 단계별 그룹핑
  const stageOrder: readonly BreedingStage[] = [
    'open', 'estrus_detected', 'inseminated',
    'pregnancy_confirmed', 'late_gestation', 'calving_expected',
  ];

  const pipeline: BreedingStageGroup[] = stageOrder.map((stage) => {
    const stageAnimals = summaries
      .filter((s) => s.currentStage === stage)
      .sort((a, b) => {
        const urgencyOrder = ['critical', 'high', 'medium', 'low'];
        return urgencyOrder.indexOf(a.urgency) - urgencyOrder.indexOf(b.urgency);
      });

    return {
      stage,
      label: STAGE_LABELS[stage],
      count: stageAnimals.length,
      animals: stageAnimals,
    };
  });

  // 7. KPI 산출
  const kpis = calcKpis(cwBreedingEvents, pregnancyResults, recentEvents, summaries, calvingByAnimal, inseminationsByAnimal);

  // 긴급 조치 정렬 (시간 임박 순)
  urgentActions.sort((a, b) => a.hoursRemaining - b.hoursRemaining);

  logger.info(
    { totalAnimals: summaries.length, stages: pipeline.map((p) => `${p.stage}:${p.count}`).join(' ') },
    '[BreedingPipeline] 파이프라인 산출 완료',
  );

  return {
    pipeline,
    kpis,
    urgentActions: urgentActions.slice(0, 20),
    totalAnimals: summaries.length,
    lastUpdated: now.toISOString(),
  };
}

// ===========================
// 단계 판별 로직
// ===========================

function determineStage(
  latestEvent: { eventType: string; detectedAt: Date; details: unknown } | undefined,
  latestPregnancy: { result: string; checkDate: Date } | undefined,
  gestationDays: number,
  now: Date,
): { stage: BreedingStage; lastEventDate: string | null; daysInStage: number } {
  if (!latestEvent) {
    return { stage: 'open', lastEventDate: null, daysInStage: 999 };
  }

  const eventDate = new Date(latestEvent.detectedAt);
  const daysSinceEvent = Math.floor((now.getTime() - eventDate.getTime()) / MS_PER_DAY);

  // 임신 확인된 경우
  if (latestPregnancy?.result === 'pregnant') {
    const daysSinceConfirm = Math.floor((now.getTime() - new Date(latestPregnancy.checkDate).getTime()) / MS_PER_DAY);
    const estimatedGestationDay = daysSinceConfirm + 28; // 수정 후 ~28일에 확인 가정

    if (estimatedGestationDay >= gestationDays - 30) {
      return { stage: 'calving_expected', lastEventDate: latestPregnancy.checkDate.toISOString(), daysInStage: daysSinceConfirm };
    }
    if (estimatedGestationDay >= gestationDays - 90) {
      return { stage: 'late_gestation', lastEventDate: latestPregnancy.checkDate.toISOString(), daysInStage: daysSinceConfirm };
    }
    return { stage: 'pregnancy_confirmed', lastEventDate: latestPregnancy.checkDate.toISOString(), daysInStage: daysSinceConfirm };
  }

  // 최근 이벤트 유형별
  const type = latestEvent.eventType;

  if (type === 'calving' || type === 'calving_confirmation' || type === 'calving_detection') {
    // 분만 후 → open
    return { stage: 'open', lastEventDate: eventDate.toISOString(), daysInStage: daysSinceEvent };
  }

  if (type === 'estrus' || type === 'heat' || type === 'heat_dnb' || type === 'estrus_dnb') {
    if (daysSinceEvent <= 3) {
      return { stage: 'estrus_detected', lastEventDate: eventDate.toISOString(), daysInStage: daysSinceEvent };
    }
    // 발정 후 3일 이상 지나면 미수정 → open
    return { stage: 'open', lastEventDate: eventDate.toISOString(), daysInStage: daysSinceEvent };
  }

  if (type === 'insemination') {
    // 수정 후 임신감정 전
    return { stage: 'inseminated', lastEventDate: eventDate.toISOString(), daysInStage: daysSinceEvent };
  }

  if (type === 'dry_off') {
    return { stage: 'late_gestation', lastEventDate: eventDate.toISOString(), daysInStage: daysSinceEvent };
  }

  // 기타 → open
  return { stage: 'open', lastEventDate: eventDate.toISOString(), daysInStage: daysSinceEvent };
}

// ===========================
// 긴급도 계산
// ===========================

function calcUrgency(
  stage: BreedingStage,
  daysInStage: number,
  events: readonly { eventType: string }[],
): 'critical' | 'high' | 'medium' | 'low' {
  if (stage === 'estrus_detected') return 'critical'; // 수정 적기
  if (stage === 'calving_expected') return 'high'; // 분만 임박
  if (stage === 'inseminated' && daysInStage >= 25) return 'high'; // 임신감정 시기
  if (stage === 'open' && daysInStage >= 200) return 'high'; // 장기공태

  // 반복 실패 (insemination 3회 이상인데 아직 open)
  const inseminationCount = events.filter((e) => e.eventType === 'insemination').length;
  if (stage === 'open' && inseminationCount >= 3) return 'high';

  if (stage === 'late_gestation') return 'medium';
  if (stage === 'inseminated') return 'medium';

  return 'low';
}

// ===========================
// 긴급 조치 도출
// ===========================

function deriveUrgentAction(
  animal: { animalId: string; earTag: string; farmId: string },
  stage: BreedingStage,
  daysInStage: number,
  events: readonly { eventType: string; detectedAt: Date }[],
  farmName: string,
  pregnancyCheckDays: number,
  now: Date,
): BreedingUrgentAction | null {
  if (stage === 'estrus_detected') {
    const estrusEvent = events.find((e) => e.eventType === 'estrus' || e.eventType === 'heat');
    const hoursSince = estrusEvent
      ? (now.getTime() - new Date(estrusEvent.detectedAt).getTime()) / 3_600_000
      : 0;
    const hoursRemaining = Math.max(0, 18 - hoursSince); // 18시간 윈도우

    return {
      animalId: animal.animalId,
      earTag: animal.earTag,
      farmId: animal.farmId,
      farmName,
      actionType: 'inseminate_now',
      description: `발정 감지 ${Math.round(hoursSince)}시간 전 — 수정 적기 ${hoursRemaining > 0 ? `${Math.round(hoursRemaining)}시간 남음` : '초과'}`,
      hoursRemaining,
      detectedAt: estrusEvent?.detectedAt.toISOString() ?? now.toISOString(),
    };
  }

  if (stage === 'inseminated' && daysInStage >= pregnancyCheckDays - 3) {
    return {
      animalId: animal.animalId,
      earTag: animal.earTag,
      farmId: animal.farmId,
      farmName,
      actionType: 'pregnancy_check_due',
      description: `수정 후 ${daysInStage}일 — 임신감정 시기 (목표 ${pregnancyCheckDays}일)`,
      hoursRemaining: Math.max(0, (pregnancyCheckDays - daysInStage) * 24),
      detectedAt: now.toISOString(),
    };
  }

  if (stage === 'calving_expected') {
    return {
      animalId: animal.animalId,
      earTag: animal.earTag,
      farmId: animal.farmId,
      farmName,
      actionType: 'calving_imminent',
      description: `분만 예정 — 밀착 관찰 필요`,
      hoursRemaining: 48,
      detectedAt: now.toISOString(),
    };
  }

  // 반복 실패
  const inseminationCount = events.filter((e) => e.eventType === 'insemination').length;
  if (stage === 'open' && inseminationCount >= 3) {
    return {
      animalId: animal.animalId,
      earTag: animal.earTag,
      farmId: animal.farmId,
      farmName,
      actionType: 'repeat_breeder',
      description: `수정 ${inseminationCount}회 실패 — 반복번식장애 의심, 수의사 진찰 권고`,
      hoursRemaining: 168,
      detectedAt: now.toISOString(),
    };
  }

  return null;
}

// ===========================
// KPI 산출
// ===========================

function calcKpis(
  _cwEvents: readonly { type: string; eventDate: Date }[],
  pregnancies: readonly { result: string; checkDate: Date }[],
  smaxtecEvts: readonly { eventType: string }[],
  summaries: readonly BreedingAnimalSummary[],
  calvingByAnimal: ReadonlyMap<string, readonly Date[]>,
  inseminationsByAnimal: ReadonlyMap<string, readonly Date[]>,
): BreedingKpis {
  // 수태율: pregnant / (pregnant + open)
  const pregnantCount = pregnancies.filter((p) => p.result === 'pregnant').length;
  const openCount = pregnancies.filter((p) => p.result === 'open' || p.result === 'not_pregnant').length;
  const decided = pregnantCount + openCount;
  const conceptionRate = decided > 0 ? Math.round((pregnantCount / decided) * 100) : 0;

  // 발정탐지율: smaXtec estrus 이벤트 / 전체 암소 × 21일 기대치
  const estrusEvents = smaxtecEvts.filter((e) => e.eventType === 'estrus' || e.eventType === 'heat').length;
  const totalFemales = summaries.length;
  const expectedEstrus = Math.max(1, totalFemales * 0.6); // 60% 발정 기대 (임신 제외)
  const estrusDetectionRate = Math.min(100, Math.round((estrusEvents / expectedEstrus) * 100));

  // 평균공태일 (open 상태 개체들의 daysInStage 평균)
  const openAnimals = summaries.filter((s) => s.currentStage === 'open');
  const avgDaysOpen = openAnimals.length > 0
    ? Math.round(openAnimals.reduce((s, a) => s + a.daysInStage, 0) / openAnimals.length)
    : 0;

  // 분만간격 — 개체별 연속 분만일 간격의 전체 평균
  // 개체별 분만일 정규화 (이후 첫수정일수 계산도 동일 데이터 사용)
  const dedupedCalvingByAnimal = new Map<string, Date[]>();
  for (const [animalId, calvings] of calvingByAnimal) {
    dedupedCalvingByAnimal.set(animalId, dedupCalvingDates(calvings));
  }
  const calvingIntervals: number[] = [];
  for (const [, calvings] of dedupedCalvingByAnimal) {
    for (let i = 1; i < calvings.length; i++) {
      const prev = calvings[i - 1];
      const curr = calvings[i];
      if (prev && curr) {
        calvingIntervals.push(Math.floor((curr.getTime() - prev.getTime()) / MS_PER_DAY));
      }
    }
  }
  const avgCalvingInterval = calvingIntervals.length > 0
    ? Math.round(calvingIntervals.reduce((s, v) => s + v, 0) / calvingIntervals.length)
    : 0;

  // 첫 수정일수 — 개체별 분만 후 첫 수정까지 일수의 전체 평균
  const daysToFirstServiceValues: number[] = [];
  for (const [animalId, calvings] of dedupedCalvingByAnimal) {
    const insemDates = (inseminationsByAnimal.get(animalId) ?? [])
      .map((d) => d.getTime())
      .sort((a, b) => a - b);

    for (const calvDate of calvings) {
      const calvTime = calvDate.getTime();
      const firstInsAfterCalv = insemDates.find((t) => t > calvTime);
      if (firstInsAfterCalv) {
        daysToFirstServiceValues.push(Math.floor((firstInsAfterCalv - calvTime) / MS_PER_DAY));
      }
    }
  }
  const avgDaysToFirstService = daysToFirstServiceValues.length > 0
    ? Math.round(daysToFirstServiceValues.reduce((s, v) => s + v, 0) / daysToFirstServiceValues.length)
    : 0;

  // 임신율 = 발정탐지율 × 수태율 / 100
  const pregnancyRate = Math.round((estrusDetectionRate * conceptionRate) / 100);

  return {
    conceptionRate,
    estrusDetectionRate,
    avgDaysOpen,
    avgCalvingInterval,
    avgDaysToFirstService,
    pregnancyRate,
  };
}

// ===========================
// 캘린더 이벤트 산출
// ===========================

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

function makeCalendarEvent(
  animalId: string,
  earTag: string,
  farmId: string,
  farmName: string,
  date: Date,
  type: CalendarEventType,
  status: CalendarEvent['status'],
  urgency: CalendarEvent['urgency'],
  description: string,
): CalendarEvent {
  return {
    eventId: `${animalId}-${type}-${toDateStr(date)}`,
    animalId,
    earTag,
    farmId,
    farmName,
    date: toDateStr(date),
    type,
    status,
    urgency,
    description,
  };
}

export async function getBreedingCalendarEvents(
  startDate: string,
  endDate: string,
  farmId?: string,
): Promise<readonly CalendarEvent[]> {
  const db = getDb();
  const now = new Date();
  const rangeStart = new Date(startDate);
  const rangeEnd = new Date(endDate);
  const since365d = new Date(now.getTime() - 365 * MS_PER_DAY);

  function inRange(d: Date): boolean {
    return d >= rangeStart && d <= rangeEnd;
  }

  // 1. 활성 암소 조회
  const animalConditions = [eq(animals.status, 'active'), isNull(animals.deletedAt)];
  if (farmId) animalConditions.push(eq(animals.farmId, farmId));

  const allAnimals = await db
    .select({ animalId: animals.animalId, earTag: animals.earTag, farmId: animals.farmId, sex: animals.sex })
    .from(animals)
    .where(and(...animalConditions));

  const femaleAnimals = allAnimals.filter((a) => a.sex !== 'male');
  const animalIds = femaleAnimals.map((a) => a.animalId);
  if (animalIds.length === 0) return [];

  // 농장명
  const farmIds = [...new Set(femaleAnimals.map((a) => a.farmId))];
  const farmRows = farmIds.length > 0
    ? await db.select({ farmId: farms.farmId, name: farms.name }).from(farms).where(inArray(farms.farmId, farmIds))
    : [];
  const farmNameMap = new Map(farmRows.map((f) => [f.farmId, f.name]));

  // 2. 번식 이벤트 조회 (smaXtec + 수동)
  const recentEvents = await db
    .select({ animalId: smaxtecEvents.animalId, eventType: smaxtecEvents.eventType, detectedAt: smaxtecEvents.detectedAt, details: smaxtecEvents.details })
    .from(smaxtecEvents)
    .where(and(inArray(smaxtecEvents.animalId, animalIds), inArray(smaxtecEvents.eventType, [...BREEDING_EVENT_TYPES]), gte(smaxtecEvents.detectedAt, since365d)))
    .orderBy(desc(smaxtecEvents.detectedAt));

  const cwBreedingEvts = await db
    .select({ animalId: breedingEvents.animalId, type: breedingEvents.type, eventDate: breedingEvents.eventDate })
    .from(breedingEvents)
    .where(and(inArray(breedingEvents.animalId, animalIds), gte(breedingEvents.eventDate, since365d)));

  // 임신감정 결과
  const manualPregnancies = await db
    .select({ animalId: pregnancyChecks.animalId, result: pregnancyChecks.result, checkDate: pregnancyChecks.checkDate })
    .from(pregnancyChecks)
    .where(inArray(pregnancyChecks.animalId, animalIds))
    .orderBy(desc(pregnancyChecks.checkDate));

  // 분만 기록
  const manualCalvings = await db
    .select({ animalId: calvingEvents.animalId, calvingDate: calvingEvents.calvingDate })
    .from(calvingEvents)
    .where(inArray(calvingEvents.animalId, animalIds));

  // 목장 설정
  const settings = farmId ? await getFarmBreedingSettings(farmId) : null;
  const gestationDays = settings?.gestationDays ?? 280;
  const pregnancyCheckDays = settings?.pregnancyCheckDays ?? 28;
  const estrusRecurrenceDays = settings?.estrusRecurrenceDays ?? 21;
  const dryOffDays = settings?.dryOffBeforeCalvingDays ?? 90;

  // 3. 개체별 이벤트 그룹핑
  const eventsByAnimal = new Map<string, typeof recentEvents>();
  for (const evt of recentEvents) {
    const list = eventsByAnimal.get(evt.animalId) ?? [];
    list.push(evt);
    eventsByAnimal.set(evt.animalId, list);
  }

  const calendarEvents: CalendarEvent[] = [];

  // 4. 개체별 캘린더 이벤트 생성
  for (const animal of femaleAnimals) {
    const farmName = farmNameMap.get(animal.farmId) ?? '미상';
    const events = eventsByAnimal.get(animal.animalId) ?? [];

    // === 과거 실적 이벤트 ===

    // 수정 실적
    for (const evt of events) {
      if (evt.eventType !== 'insemination') continue;
      const d = new Date(evt.detectedAt);
      if (inRange(d)) {
        calendarEvents.push(makeCalendarEvent(
          animal.animalId, animal.earTag, animal.farmId, farmName,
          d, 'insemination', 'completed', 'low',
          `${animal.earTag} 수정 완료`,
        ));
      }
    }
    for (const evt of cwBreedingEvts) {
      if (evt.animalId !== animal.animalId || evt.type !== 'insemination' || !evt.eventDate) continue;
      if (inRange(evt.eventDate)) {
        calendarEvents.push(makeCalendarEvent(
          animal.animalId, animal.earTag, animal.farmId, farmName,
          evt.eventDate, 'insemination', 'completed', 'low',
          `${animal.earTag} 수정 완료 (수동 기록)`,
        ));
      }
    }

    // 임신감정 실적
    for (const p of manualPregnancies) {
      if (p.animalId !== animal.animalId) continue;
      const d = new Date(p.checkDate);
      if (inRange(d)) {
        calendarEvents.push(makeCalendarEvent(
          animal.animalId, animal.earTag, animal.farmId, farmName,
          d, 'pregnancy_check_done', 'completed', 'low',
          `${animal.earTag} 임신감정 ${p.result === 'pregnant' ? '✓ 임신' : '✗ 공태'}`,
        ));
      }
    }

    // 분만 실적 (smaXtec)
    for (const evt of events) {
      if (evt.eventType !== 'calving' && evt.eventType !== 'calving_confirmation' && evt.eventType !== 'calving_detection') continue;
      const d = new Date(evt.detectedAt);
      if (inRange(d)) {
        calendarEvents.push(makeCalendarEvent(
          animal.animalId, animal.earTag, animal.farmId, farmName,
          d, 'calving_done', 'completed', 'low',
          `${animal.earTag} 분만 완료`,
        ));
      }
    }
    for (const c of manualCalvings) {
      if (c.animalId !== animal.animalId || !c.calvingDate) continue;
      if (inRange(c.calvingDate)) {
        calendarEvents.push(makeCalendarEvent(
          animal.animalId, animal.earTag, animal.farmId, farmName,
          c.calvingDate, 'calving_done', 'completed', 'low',
          `${animal.earTag} 분만 완료 (수동 기록)`,
        ));
      }
    }

    // === 예정 이벤트 (미래) ===

    // 최신 수정일 → 임신감정 예정, 분만 예정, 건유 예정
    const latestInsemination = events.find((e) => e.eventType === 'insemination');
    const latestInsemDate = latestInsemination ? new Date(latestInsemination.detectedAt) : null;

    // 최신 임신감정 결과
    const latestPregnancy = manualPregnancies.find((p) => p.animalId === animal.animalId);
    const isPregnant = latestPregnancy?.result === 'pregnant';

    if (latestInsemDate) {
      // 임신감정 예정일
      const checkDue = addDays(latestInsemDate, pregnancyCheckDays);
      if (inRange(checkDue) && !isPregnant) {
        const isOverdue = checkDue < now;
        calendarEvents.push(makeCalendarEvent(
          animal.animalId, animal.earTag, animal.farmId, farmName,
          checkDue, 'pregnancy_check_due', isOverdue ? 'overdue' : 'scheduled',
          isOverdue ? 'high' : 'medium',
          `${animal.earTag} 임신감정 예정 (수정 후 ${pregnancyCheckDays}일)`,
        ));
      }

      // 재검사 예정 (1차 감정 + 14일)
      if (latestPregnancy && latestPregnancy.result === 'pregnant') {
        const recheckDate = addDays(new Date(latestPregnancy.checkDate), 14);
        if (inRange(recheckDate)) {
          calendarEvents.push(makeCalendarEvent(
            animal.animalId, animal.earTag, animal.farmId, farmName,
            recheckDate, 'recheck_due', recheckDate < now ? 'overdue' : 'scheduled', 'medium',
            `${animal.earTag} 재검사 예정`,
          ));
        }
      }

      if (isPregnant) {
        // 분만 예정일 (수정일 + 280일)
        const calvingDue = addDays(latestInsemDate, gestationDays);
        if (inRange(calvingDue)) {
          const daysUntil = Math.floor((calvingDue.getTime() - now.getTime()) / MS_PER_DAY);
          calendarEvents.push(makeCalendarEvent(
            animal.animalId, animal.earTag, animal.farmId, farmName,
            calvingDue, 'calving_expected', 'scheduled',
            daysUntil <= 7 ? 'critical' : daysUntil <= 30 ? 'high' : 'medium',
            `${animal.earTag} 분만 예정 (D-${Math.max(0, daysUntil)})`,
          ));
        }

        // 건유 예정일 (분만 예정일 - 건유일수)
        const dryOffDate = addDays(latestInsemDate, gestationDays - dryOffDays);
        if (inRange(dryOffDate)) {
          calendarEvents.push(makeCalendarEvent(
            animal.animalId, animal.earTag, animal.farmId, farmName,
            dryOffDate, 'dry_off', dryOffDate < now ? 'overdue' : 'scheduled',
            dryOffDate < now ? 'high' : 'medium',
            `${animal.earTag} 건유 시작 예정`,
          ));
        }
      }
    }

    // 발정 예상 (최근 발정 + 21일, 또는 분만 후 + 설정값)
    const latestEstrus = events.find((e) => e.eventType === 'estrus' || e.eventType === 'heat');
    if (latestEstrus && !isPregnant) {
      const estrusDate = new Date(latestEstrus.detectedAt);
      // 다음 발정 3회분 표시
      for (let cycle = 1; cycle <= 3; cycle++) {
        const nextEstrus = addDays(estrusDate, estrusRecurrenceDays * cycle);
        if (inRange(nextEstrus)) {
          const daysUntil = Math.floor((nextEstrus.getTime() - now.getTime()) / MS_PER_DAY);
          calendarEvents.push(makeCalendarEvent(
            animal.animalId, animal.earTag, animal.farmId, farmName,
            nextEstrus, 'estrus_expected', 'scheduled',
            daysUntil <= 1 ? 'critical' : daysUntil <= 3 ? 'high' : 'medium',
            `${animal.earTag} 발정 예상 (${cycle}주기)`,
          ));
        }
      }
    }
  }

  // 날짜 순 정렬
  calendarEvents.sort((a, b) => a.date.localeCompare(b.date));

  logger.info(
    { startDate, endDate, farmId, eventCount: calendarEvents.length },
    '[BreedingCalendar] 캘린더 이벤트 산출 완료',
  );

  return calendarEvents;
}
