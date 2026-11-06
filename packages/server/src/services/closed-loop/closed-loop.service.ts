// 폐루프 건강관리 서비스 — 감지(smaXtec) → 개입(치료) → 센서 검증 → 수의사 확정
// 순수 로직은 closed-loop-engine.ts / closed-loop-protocols.ts, 여기는 DB 입출력만.

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type {
  ClosedLoopOpenDetection,
  ClosedLoopStatus,
  ClosedLoopTreatmentItem,
  LoopVerification,
} from '@cowtalk/shared';
import { getDb } from '../../config/database.js';
import { animals, healthEvents, sensorDailyAgg, smaxtecEvents, treatments, type TreatmentDetails } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import {
  buildEpisodes,
  isFinalVerdict,
  linkInterventions,
  ratio,
  toDateStr,
  verifyLoop,
  type DailyPoint,
} from './closed-loop-engine.js';
import { HEALTH_DETECTION_EVENT_TYPES, resolveProtocol } from './closed-loop-protocols.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TREATMENTS = 200;
const MAX_OPEN = 30;
const OPEN_MIN_HOURS = 24;
const VET_FINAL = new Set(['recovered', 'relapsed', 'worsened']);

interface TreatmentRow {
  readonly treatmentId: string;
  readonly animalId: string;
  readonly farmId: string;
  readonly earTag: string;
  readonly diagnosis: string;
  readonly drug: string;
  readonly administeredAt: Date;
  readonly details: TreatmentDetails | null;
}

async function loadTreatments(since: Date, farmId?: string): Promise<readonly TreatmentRow[]> {
  const db = getDb();
  const conds = [gte(treatments.administeredAt, since)];
  if (farmId) conds.push(eq(animals.farmId, farmId));
  const rows = await db
    .select({
      treatmentId: treatments.treatmentId,
      animalId: healthEvents.animalId,
      farmId: animals.farmId,
      earTag: animals.earTag,
      diagnosis: healthEvents.diagnosis,
      drug: treatments.drug,
      administeredAt: treatments.administeredAt,
      details: treatments.details,
    })
    .from(treatments)
    .innerJoin(healthEvents, eq(treatments.healthEventId, healthEvents.eventId))
    .innerJoin(animals, eq(healthEvents.animalId, animals.animalId))
    .where(and(...conds))
    .orderBy(desc(treatments.administeredAt))
    .limit(MAX_TREATMENTS);
  return rows.map((r) => ({ ...r, administeredAt: new Date(r.administeredAt), details: r.details ?? null }));
}

/** 여러 개체의 일별 센서를 한 번에 — N+1 회피 */
async function loadDailyPoints(animalIds: readonly string[], fromDate: Date): Promise<ReadonlyMap<string, DailyPoint[]>> {
  const map = new Map<string, DailyPoint[]>();
  if (animalIds.length === 0) return map;
  const db = getDb();
  const rows = await db
    .select({
      animalId: sensorDailyAgg.animalId,
      date: sensorDailyAgg.date,
      metricType: sensorDailyAgg.metricType,
      avg: sensorDailyAgg.avg,
    })
    .from(sensorDailyAgg)
    .where(and(
      inArray(sensorDailyAgg.animalId, [...animalIds]),
      gte(sensorDailyAgg.date, toDateStr(fromDate)),
      inArray(sensorDailyAgg.metricType, ['temperature', 'rumination', 'activity']),
    ));
  for (const r of rows) {
    const arr = map.get(r.animalId) ?? [];
    arr.push({ date: String(r.date).slice(0, 10), metricType: r.metricType, avg: r.avg });
    map.set(r.animalId, arr);
  }
  return map;
}

async function loadDetections(farmIds: readonly string[] | null, since: Date) {
  const db = getDb();
  const conds = [
    gte(smaxtecEvents.detectedAt, since),
    inArray(smaxtecEvents.eventType, [...HEALTH_DETECTION_EVENT_TYPES]),
  ];
  if (farmIds) conds.push(inArray(smaxtecEvents.farmId, [...farmIds]));
  const rows = await db
    .select({
      animalId: smaxtecEvents.animalId,
      eventType: smaxtecEvents.eventType,
      severity: smaxtecEvents.severity,
      detectedAt: smaxtecEvents.detectedAt,
      acknowledged: smaxtecEvents.acknowledged,
    })
    .from(smaxtecEvents)
    .where(and(...conds))
    .orderBy(desc(smaxtecEvents.detectedAt))
    .limit(5000);
  return rows.map((r) => ({ ...r, detectedAt: new Date(r.detectedAt) }));
}

interface Evaluated {
  readonly row: TreatmentRow;
  readonly anchorAt: Date | null;
  readonly verification: LoopVerification;
}

/** 처치 목록 → 감지 연결 + 센서 검증 (DB 읽기 2회) */
async function evaluate(rows: readonly TreatmentRow[], detectionSince: Date, now: Date) {
  const farmIds = [...new Set(rows.map((r) => r.farmId))];
  const detections = farmIds.length > 0 ? await loadDetections(farmIds, detectionSince) : [];
  const episodes = buildEpisodes(detections);
  const link = linkInterventions(
    episodes,
    rows.map((r) => ({ id: r.treatmentId, animalId: r.animalId, at: r.administeredAt })),
  );

  const earliest = rows.reduce(
    (min, r) => Math.min(min, (link.anchorByIntervention.get(r.treatmentId) ?? r.administeredAt).getTime()),
    now.getTime(),
  );
  const points = await loadDailyPoints([...new Set(rows.map((r) => r.animalId))], new Date(earliest - 4 * DAY_MS));

  const evaluated: Evaluated[] = rows.map((row) => {
    const anchorAt = link.anchorByIntervention.get(row.treatmentId) ?? null;
    const verification = verifyLoop({
      protocol: resolveProtocol(row.diagnosis),
      interventionAt: row.administeredAt,
      anchorAt: anchorAt ?? row.administeredAt,
      points: points.get(row.animalId) ?? [],
      now,
    });
    return { row, anchorAt, verification };
  });
  return { evaluated, episodes, link };
}

// ── 배치: 검증 결과를 treatments.details.closedLoop 에 기록 ──

export interface ClosedLoopBatchResult {
  readonly checked: number;
  readonly updated: number;
  readonly byVerdict: Readonly<Record<string, number>>;
}

export async function runClosedLoopVerification(now: Date = new Date()): Promise<ClosedLoopBatchResult> {
  const db = getDb();
  // 가장 긴 검증 창(시작 24h + 120h) + 여유 → 14일
  const since = new Date(now.getTime() - 14 * DAY_MS);
  const rows = (await loadTreatments(since)).filter((r) => !VET_FINAL.has(r.details?.outcomeStatus ?? ''));
  const { evaluated } = await evaluate(rows, new Date(since.getTime() - 4 * DAY_MS), now);

  let updated = 0;
  const byVerdict: Record<string, number> = {};
  for (const e of evaluated) {
    const v = e.verification;
    byVerdict[v.verdict] = (byVerdict[v.verdict] ?? 0) + 1;
    const prev = e.row.details?.closedLoop;
    if (prev && prev.verdict === v.verdict && prev.windowComplete === v.windowComplete && prev.post.days === v.post.days) continue;
    // closedLoop 키만 원자적으로 병합 — 동시에 수의사가 outcomeStatus 를 확정해도 덮어쓰지 않는다
    await db.update(treatments)
      .set({ details: sql`coalesce(${treatments.details}, '{}'::jsonb) || jsonb_build_object('closedLoop', ${JSON.stringify(v)}::jsonb)` })
      .where(eq(treatments.treatmentId, e.row.treatmentId));
    updated++;
  }

  logger.info({ checked: evaluated.length, updated, byVerdict }, '[ClosedLoop] 센서 검증 배치 완료');
  return { checked: evaluated.length, updated, byVerdict };
}

// ── 조회: 목장 폐루프 현황 ──

export async function getFarmClosedLoopStatus(farmId: string, days = 14, now: Date = new Date()): Promise<ClosedLoopStatus> {
  const since = new Date(now.getTime() - days * DAY_MS);
  const rows = await loadTreatments(since, farmId);
  // 처치가 없어도 감지 현황은 보여야 한다 — 감지는 farmId 로 직접 로드
  const detections = await loadDetections([farmId], new Date(since.getTime() - 3 * DAY_MS));
  const { evaluated } = rows.length > 0
    ? await evaluate(rows, new Date(since.getTime() - 3 * DAY_MS), now)
    : { evaluated: [] as Evaluated[] };

  const episodes = buildEpisodes(detections).filter((e) => e.startAt.getTime() >= since.getTime());
  const link = linkInterventions(
    episodes,
    rows.map((r) => ({ id: r.treatmentId, animalId: r.animalId, at: r.administeredAt })),
  );

  const earTags = new Map<string, string>(rows.map((r) => [r.animalId, r.earTag]));
  const missing = [...new Set(link.openEpisodes.map((e) => e.animalId))].filter((id) => !earTags.has(id));
  if (missing.length > 0) {
    const db = getDb();
    const tagRows = await db
      .select({ animalId: animals.animalId, earTag: animals.earTag })
      .from(animals)
      .where(inArray(animals.animalId, missing));
    for (const t of tagRows) earTags.set(t.animalId, t.earTag);
  }

  const openDetections: ClosedLoopOpenDetection[] = link.openEpisodes
    .map((e) => ({
      animalId: e.animalId,
      earTag: earTags.get(e.animalId) ?? '-',
      eventTypes: e.eventTypes,
      severity: e.severity,
      detectedAt: e.startAt.toISOString(),
      hoursOpen: Math.floor((now.getTime() - e.startAt.getTime()) / 3600_000),
      acknowledged: e.acknowledged,
    }))
    .filter((e) => e.hoursOpen >= OPEN_MIN_HOURS)
    .slice(0, MAX_OPEN);

  const items: ClosedLoopTreatmentItem[] = evaluated.map((e) => ({
    treatmentId: e.row.treatmentId,
    animalId: e.row.animalId,
    earTag: e.row.earTag,
    diagnosis: e.row.diagnosis,
    drug: e.row.drug,
    administeredAt: e.row.administeredAt.toISOString(),
    detectedAt: link.anchorByIntervention.get(e.row.treatmentId)?.toISOString() ?? e.anchorAt?.toISOString() ?? null,
    vetOutcome: e.row.details?.outcomeStatus && e.row.details.outcomeStatus !== 'pending' ? e.row.details.outcomeStatus : null,
    verification: e.verification,
  }));

  const verified = items.filter((i) => isFinalVerdict(i.verification.verdict)).length;
  const resolved = items.filter((i) => i.verification.verdict === 'resolved').length;
  const vetConfirmed = items.filter((i) => i.vetOutcome !== null).length;
  const closed = items.filter((i) => i.vetOutcome !== null || isFinalVerdict(i.verification.verdict)).length;
  const sensorOnly = items.filter((i) => i.detectedAt === null).length;

  const funnel = {
    detected: episodes.length,
    intervened: link.intervenedEpisodes.length,
    sensorOnlyTreatments: sensorOnly,
    verified,
    resolved,
    vetConfirmed,
    interventionRate: ratio(link.intervenedEpisodes.length, episodes.length),
    closureRate: ratio(closed, items.length),
  };

  const urgent = items.filter((i) => i.vetOutcome === null && (i.verification.verdict === 'worsened' || i.verification.verdict === 'not_improved'));
  const awaitingVet = items.filter((i) => i.vetOutcome === null && i.verification.verdict === 'resolved');
  const pct = (r: number | null): string => (r === null ? '—' : `${Math.round(r * 100)}%`);

  return {
    farmId,
    days,
    generatedAt: now.toISOString(),
    funnel,
    treatments: items,
    openDetections,
    roleSpecific: {
      farmer: urgent.length > 0
        ? `악화·미회복 ${urgent.length}두(${urgent.slice(0, 3).map((i) => i.earTag).join(', ')}) — 수의사 재진을 요청하세요. 조치 미기록 감지 ${openDetections.length}건은 확인 후 처치·관찰을 기록해 주세요.`
        : `최근 ${days}일 처치 ${items.length}건 중 악화 신호 없음. 조치 미기록 감지 ${openDetections.length}건을 확인해 주세요.`,
      veterinarian: `센서 기준 회복 ${awaitingVet.length}건은 결과 확정(confirm_treatment_outcome) 대기, 재평가 필요 ${urgent.length}건. 루프 종결률 ${pct(funnel.closureRate)}.`,
      government_admin: `감지→개입 연결률 ${pct(funnel.interventionRate)}, 개입→검증 종결률 ${pct(funnel.closureRate)} — 알람이 실제 조치와 효과 확인까지 이어지는 비율(디지털 방역·축산행정 성과지표).`,
    },
  };
}
