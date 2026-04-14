/**
 * 발정동기화 프로그램 스케줄러
 *
 * 수의사가 공태 소에 발정동기화 프로그램(OVSYNCH, PG, G6G, Double OVSYNCH)을 처방하면,
 * 프로그램별 호르몬 투여 일정을 자동 생성하여 "오늘 할 일"에 표시한다.
 *
 * 흐름:
 * 1. 수의사가 프로그램 선택 + 시작일 입력
 * 2. 프로토콜에 따라 각 Day의 처치를 breeding_events에 scheduled 상태로 생성
 * 3. 매일 배치가 "오늘 할 일"을 조회 → 팅커벨이 안내
 * 4. 목장주/수정사가 처치 완료 기록 → done 상태로 전환
 */

import { getDb } from '../../config/database.js';
import { breedingEvents } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

// ─── 프로토콜 정의 ──────────────────────────────────────────────

export type SyncProtocol = 'PG' | 'OVSYNCH' | 'G6G' | 'DOUBLE_OVSYNCH';

interface ProtocolStep {
  readonly dayOffset: number;      // Day 0 기준
  readonly treatment: string;      // 약물명
  readonly route: string;          // 투여 경로 (IM, PO, etc.)
  readonly isAI: boolean;          // 수정(AI) 시행일인지
  readonly note: string;
}

interface ProtocolDefinition {
  readonly protocol: SyncProtocol;
  readonly nameKo: string;
  readonly description: string;
  readonly steps: readonly ProtocolStep[];
  readonly totalDays: number;
}

const PROTOCOLS: Readonly<Record<SyncProtocol, ProtocolDefinition>> = {
  PG: {
    protocol: 'PG',
    nameKo: 'PG법 (Prostaglandin)',
    description: 'PG₂α 2회 투여. 가장 단순한 프로토콜.',
    totalDays: 17,
    steps: [
      { dayOffset: 0,  treatment: 'PG₂α (Lutalyse 5mL / Estrumate 2mL)', route: 'IM', isAI: false, note: '1차 투여 — 황체 퇴행 유도' },
      { dayOffset: 14, treatment: 'PG₂α', route: 'IM', isAI: false, note: '2차 투여' },
      { dayOffset: 16, treatment: '수정(AI)', route: '-', isAI: true, note: '2차 PG 후 48~72시간. 발정 확인 후 수정' },
    ],
  },
  OVSYNCH: {
    protocol: 'OVSYNCH',
    nameKo: 'OVSYNCH (오브싱크)',
    description: 'GnRH-PG-GnRH. 가장 보편적 프로토콜. 수태율 약 35~40%.',
    totalDays: 10,
    steps: [
      { dayOffset: 0, treatment: 'GnRH (Fertagyl 2mL / Cystorelin 2mL)', route: 'IM', isAI: false, note: '배란 동기화 — 난포 wave 리셋' },
      { dayOffset: 7, treatment: 'PG₂α', route: 'IM', isAI: false, note: '황체 퇴행' },
      { dayOffset: 9, treatment: 'GnRH', route: 'IM', isAI: false, note: '배란 유도 — 수정 16~20시간 전' },
      { dayOffset: 10, treatment: '수정(AI)', route: '-', isAI: true, note: '2차 GnRH 후 16~20시간' },
    ],
  },
  G6G: {
    protocol: 'G6G',
    nameKo: 'G6G (Pre-OVSYNCH)',
    description: 'PG+GnRH 전처리 후 OVSYNCH. 난포 wave 정밀 동기화.',
    totalDays: 18,
    steps: [
      { dayOffset: 0,  treatment: 'PG₂α', route: 'IM', isAI: false, note: '전처리 — 잔여 황체 퇴행' },
      { dayOffset: 2,  treatment: 'GnRH', route: 'IM', isAI: false, note: '전처리 — 새 난포 wave 유도' },
      { dayOffset: 8,  treatment: 'GnRH', route: 'IM', isAI: false, note: 'OVSYNCH 시작' },
      { dayOffset: 15, treatment: 'PG₂α', route: 'IM', isAI: false, note: 'OVSYNCH PG' },
      { dayOffset: 17, treatment: 'GnRH', route: 'IM', isAI: false, note: '배란 유도' },
      { dayOffset: 18, treatment: '수정(AI)', route: '-', isAI: true, note: '2차 GnRH 후 16~20시간' },
    ],
  },
  DOUBLE_OVSYNCH: {
    protocol: 'DOUBLE_OVSYNCH',
    nameKo: 'Double OVSYNCH (더블 오브싱크)',
    description: 'Pre-synch + OVSYNCH. 최고 수태율(~50%) but 처치 횟수 많음.',
    totalDays: 27,
    steps: [
      { dayOffset: 0,  treatment: 'GnRH', route: 'IM', isAI: false, note: 'Pre-synch 시작' },
      { dayOffset: 7,  treatment: 'PG₂α', route: 'IM', isAI: false, note: 'Pre-synch PG' },
      { dayOffset: 10, treatment: 'GnRH', route: 'IM', isAI: false, note: 'Pre-synch 완료' },
      { dayOffset: 17, treatment: 'GnRH', route: 'IM', isAI: false, note: 'OVSYNCH 시작' },
      { dayOffset: 24, treatment: 'PG₂α', route: 'IM', isAI: false, note: 'OVSYNCH PG' },
      { dayOffset: 26, treatment: 'GnRH', route: 'IM', isAI: false, note: '배란 유도' },
      { dayOffset: 27, treatment: '수정(AI)', route: '-', isAI: true, note: '2차 GnRH 후 16~20시간' },
    ],
  },
};

// ─── 스케줄 생성 ────────────────────────────────────────────────

export interface SyncScheduleInput {
  readonly animalId: string;
  readonly farmId: string;
  readonly protocol: SyncProtocol;
  readonly startDate: string;       // YYYY-MM-DD
  readonly prescribedBy?: string;   // 처방 수의사
  readonly notes?: string;
}

export interface SyncScheduleResult {
  readonly protocol: SyncProtocol;
  readonly protocolName: string;
  readonly animalId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly aiDate: string;          // 수정 예정일
  readonly steps: readonly ScheduledStep[];
  readonly eventsCreated: number;
}

interface ScheduledStep {
  readonly date: string;
  readonly dayOffset: number;
  readonly treatment: string;
  readonly route: string;
  readonly isAI: boolean;
  readonly note: string;
  readonly eventId: string | null;
}

/**
 * 발정동기화 프로그램 스케줄 생성
 * 프로토콜 선택 + 시작일 입력 → breeding_events에 scheduled 상태로 자동 생성
 */
export async function createSyncSchedule(input: SyncScheduleInput): Promise<SyncScheduleResult> {
  const db = getDb();
  const protocol = PROTOCOLS[input.protocol];
  if (!protocol) {
    throw new Error(`알 수 없는 프로토콜: ${input.protocol}`);
  }

  const startDate = new Date(input.startDate);
  const scheduledSteps: ScheduledStep[] = [];
  let eventsCreated = 0;

  for (const step of protocol.steps) {
    const eventDate = new Date(startDate.getTime() + step.dayOffset * 86400_000);
    const dateStr = eventDate.toISOString().slice(0, 10);

    try {
      const [result] = await db.insert(breedingEvents).values({
        animalId: input.animalId,
        farmId: input.farmId,
        eventDate,
        type: step.isAI ? 'insemination' : 'sync_treatment',
        semenInfo: step.treatment,
        technicianName: input.prescribedBy ?? null,
        notes: `[${protocol.nameKo}] Day ${step.dayOffset}: ${step.note}${input.notes ? ` | ${input.notes}` : ''}`,
        status: 'scheduled',
      }).returning({ eventId: breedingEvents.eventId });

      scheduledSteps.push({
        date: dateStr,
        dayOffset: step.dayOffset,
        treatment: step.treatment,
        route: step.route,
        isAI: step.isAI,
        note: step.note,
        eventId: result?.eventId ?? null,
      });
      eventsCreated++;
    } catch (err) {
      logger.warn({ err, step: step.dayOffset }, '[SyncProtocol] 스케줄 생성 실패');
      scheduledSteps.push({
        ...step,
        date: dateStr,
        eventId: null,
      });
    }
  }

  const aiStep = protocol.steps.find(s => s.isAI);
  const aiDate = aiStep
    ? new Date(startDate.getTime() + aiStep.dayOffset * 86400_000).toISOString().slice(0, 10)
    : '';

  logger.info({
    protocol: input.protocol,
    animalId: input.animalId,
    startDate: input.startDate,
    eventsCreated,
  }, '[SyncProtocol] 발정동기화 스케줄 생성');

  return {
    protocol: input.protocol,
    protocolName: protocol.nameKo,
    animalId: input.animalId,
    startDate: input.startDate,
    endDate: new Date(startDate.getTime() + protocol.totalDays * 86400_000).toISOString().slice(0, 10),
    aiDate,
    steps: scheduledSteps,
    eventsCreated,
  };
}

// ─── 오늘 할 일 조회 ────────────────────────────────────────────

export interface TodaySyncTask {
  readonly eventId: string;
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly treatment: string;
  readonly protocol: string;
  readonly dayOffset: number;
  readonly note: string;
  readonly isAI: boolean;
  readonly scheduledDate: string;
}

/**
 * 오늘 예정된 발정동기화 처치 목록 조회
 */
export async function getTodaySyncTasks(farmId?: string): Promise<readonly TodaySyncTask[]> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const farmFilter = farmId ? sql`AND be.farm_id = ${farmId}` : sql``;

  const rows = await db.execute(sql`
    SELECT
      be.event_id AS "eventId",
      be.animal_id AS "animalId",
      a.ear_tag AS "earTag",
      be.farm_id AS "farmId",
      f.name AS "farmName",
      be.semen_info AS treatment,
      be.notes AS note,
      be.event_date AS "scheduledDate"
    FROM breeding_events be
    JOIN animals a ON a.animal_id = be.animal_id
    JOIN farms f ON f.farm_id = be.farm_id
    WHERE be.status = 'scheduled'
      AND be.event_date::date = ${today}::date
      ${farmFilter}
    ORDER BY f.name, a.ear_tag
  `) as unknown as TodaySyncTask[];

  return rows.map(row => {
    const noteStr = String(row.note ?? '');
    const protocolMatch = noteStr.match(/\[(.+?)\]/);
    const dayMatch = noteStr.match(/Day (\d+)/);
    return {
      ...row,
      protocol: protocolMatch?.[1] ?? '',
      dayOffset: dayMatch ? Number(dayMatch[1]) : 0,
      isAI: noteStr.includes('수정(AI)') || String(row.treatment ?? '').includes('수정'),
    };
  });
}

/**
 * 처치 완료 기록
 */
export async function completeSyncTask(eventId: string, completedBy?: string): Promise<void> {
  const db = getDb();
  await db.update(breedingEvents)
    .set({
      status: 'completed',
      technicianName: completedBy ?? null,
    })
    .where(eq(breedingEvents.eventId, eventId));

  logger.info({ eventId, completedBy }, '[SyncProtocol] 처치 완료');
}

// ─── 프로토콜 목록 조회 (UI용) ──────────────────────────────────

export function getAvailableProtocols(): readonly {
  protocol: SyncProtocol;
  nameKo: string;
  description: string;
  totalDays: number;
  stepCount: number;
}[] {
  return Object.values(PROTOCOLS).map(p => ({
    protocol: p.protocol,
    nameKo: p.nameKo,
    description: p.description,
    totalDays: p.totalDays,
    stepCount: p.steps.length,
  }));
}
