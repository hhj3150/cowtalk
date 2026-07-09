// 온톨로지 그래프 리졸버 — 기존 FK 관계를 그래프(노드+엣지)로 조회
//
// 별도 그래프 스토어를 만들지 않는다. 82개 테이블에 이미 저장된 관계를
// 앵커(개체) 중심으로 걸어 나가며 조립한다:
//   animal ─belongs_to→ farm
//   sensor_event(smaXtec) ─detected_on→ animal ←diagnosed─ health_event ←treated_with─ treatment
//   breeding_event/pregnancy_check/calving ─…→ animal
//   prediction(소버린) ─predicted_for→ animal ←labels(event_labels)─ sensor_event
//   transfer ─moved_from/moved_to→ farm (역학 접촉 경로)
//
// 소비처: 팅커벨 query_animal_graph 도구, 결정 카드 원인 체인, 향후 그래프 UI.

import { getDb } from '../../config/database.js';
import {
  animals,
  farms,
  smaxtecEvents,
  healthEvents,
  treatments,
  breedingEvents,
  pregnancyChecks,
  calvingEvents,
  predictions,
  eventLabels,
  animalTransfers,
} from '../../db/schema.js';
import { and, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import type { OntologyGraph, OntologyNode, OntologyEdge } from '@cowtalk/shared';

const MS_PER_DAY = 86_400_000;

// ===========================
// 조립 코어 (순수) — 중복 노드/엣지 제거
// ===========================

export function assembleGraph(
  anchor: string,
  nodes: readonly OntologyNode[],
  edges: readonly OntologyEdge[],
  windowDays: number,
): OntologyGraph {
  const nodeById = new Map<string, OntologyNode>();
  for (const n of nodes) {
    if (!nodeById.has(n.id)) nodeById.set(n.id, n);
  }
  const validIds = new Set(nodeById.keys());
  const edgeKeys = new Set<string>();
  const dedupedEdges: OntologyEdge[] = [];
  for (const e of edges) {
    // 양 끝 노드가 실제 존재하는 엣지만 유지
    if (!validIds.has(e.from) || !validIds.has(e.to)) continue;
    const key = `${e.from}|${e.relation}|${e.to}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    dedupedEdges.push(e);
  }
  return {
    anchor,
    nodes: [...nodeById.values()],
    edges: dedupedEdges,
    windowDays,
    generatedAt: new Date().toISOString(),
  };
}

// ===========================
// 개체 앵커 그래프
// ===========================

export async function resolveAnimalGraph(
  animalId: string,
  opts: { readonly windowDays?: number } = {},
): Promise<OntologyGraph | null> {
  const db = getDb();
  const windowDays = Math.min(opts.windowDays ?? 90, 365);
  const since = new Date(Date.now() - windowDays * MS_PER_DAY);

  // 앵커: 개체 (4개 번호체계 포함)
  const [animal] = await db
    .select({
      animalId: animals.animalId,
      earTag: animals.earTag,
      traceId: animals.traceId,
      externalId: animals.externalId,
      deviceId: animals.currentDeviceId,
      farmId: animals.farmId,
      status: animals.status,
      lactationStatus: animals.lactationStatus,
      daysInMilk: animals.daysInMilk,
      parity: animals.parity,
    })
    .from(animals)
    .where(eq(animals.animalId, animalId))
    .limit(1);
  if (!animal) return null;

  const anchorId = `animal:${animal.animalId}`;
  const nodes: OntologyNode[] = [];
  const edges: OntologyEdge[] = [];

  nodes.push({
    id: anchorId,
    type: 'animal',
    label: `개체 ${animal.earTag ?? animal.animalId.slice(0, 8)}`,
    props: {
      earTag: animal.earTag,          // 목장 관리번호
      traceId: animal.traceId,        // 이력제 번호 (12자리)
      smaxtecId: animal.externalId,   // smaXtec 개체 ID
      deviceId: animal.deviceId,      // 센서 시리얼
      status: animal.status,
      lactationStatus: animal.lactationStatus,
      daysInMilk: animal.daysInMilk,
      parity: animal.parity,
    },
  });

  // 소속 농장
  const [farm] = await db
    .select({ farmId: farms.farmId, name: farms.name, address: farms.address, headCount: farms.currentHeadCount })
    .from(farms)
    .where(eq(farms.farmId, animal.farmId))
    .limit(1);
  if (farm) {
    const farmNodeId = `farm:${farm.farmId}`;
    nodes.push({
      id: farmNodeId,
      type: 'farm',
      label: farm.name,
      props: { address: farm.address, headCount: farm.headCount },
    });
    edges.push({ from: anchorId, to: farmNodeId, relation: 'belongs_to' });
  }

  // smaXtec 이벤트 (신뢰 원천)
  const events = await db
    .select({
      eventId: smaxtecEvents.eventId,
      eventType: smaxtecEvents.eventType,
      severity: smaxtecEvents.severity,
      confidence: smaxtecEvents.confidence,
      detectedAt: smaxtecEvents.detectedAt,
    })
    .from(smaxtecEvents)
    .where(and(eq(smaxtecEvents.animalId, animalId), gte(smaxtecEvents.detectedAt, since)))
    .orderBy(sql`${smaxtecEvents.detectedAt} desc`)
    .limit(40);
  for (const e of events) {
    const id = `sensor_event:${e.eventId}`;
    nodes.push({
      id,
      type: 'sensor_event',
      label: `${e.eventType}${e.severity ? ` (${e.severity})` : ''}`,
      occurredAt: e.detectedAt.toISOString(),
      props: { eventType: e.eventType, severity: e.severity, confidence: e.confidence },
    });
    edges.push({ from: id, to: anchorId, relation: 'detected_on' });
  }

  // 진단 + 처치 (treatment → health_event → animal 체인)
  const diagnoses = await db
    .select({
      eventId: healthEvents.eventId,
      diagnosis: healthEvents.diagnosis,
      severity: healthEvents.severity,
      eventDate: healthEvents.eventDate,
    })
    .from(healthEvents)
    .where(and(eq(healthEvents.animalId, animalId), gte(healthEvents.eventDate, since)))
    .orderBy(sql`${healthEvents.eventDate} desc`)
    .limit(20);
  const healthIds = diagnoses.map((d) => d.eventId);
  for (const d of diagnoses) {
    const id = `health_event:${d.eventId}`;
    nodes.push({
      id,
      type: 'health_event',
      label: `진단: ${d.diagnosis} (${d.severity})`,
      occurredAt: d.eventDate.toISOString(),
      props: { diagnosis: d.diagnosis, severity: d.severity },
    });
    edges.push({ from: id, to: anchorId, relation: 'diagnosed' });
  }
  if (healthIds.length > 0) {
    const txs = await db
      .select({
        treatmentId: treatments.treatmentId,
        healthEventId: treatments.healthEventId,
        drug: treatments.drug,
        dosage: treatments.dosage,
        withdrawalDays: treatments.withdrawalDays,
        administeredAt: treatments.administeredAt,
      })
      .from(treatments)
      .where(inArray(treatments.healthEventId, healthIds))
      .limit(30);
    for (const t of txs) {
      const id = `treatment:${t.treatmentId}`;
      nodes.push({
        id,
        type: 'treatment',
        label: `처치: ${t.drug}${t.dosage ? ` ${t.dosage}` : ''}`,
        occurredAt: t.administeredAt.toISOString(),
        props: { drug: t.drug, dosage: t.dosage, withdrawalDays: t.withdrawalDays },
      });
      edges.push({ from: id, to: `health_event:${t.healthEventId}`, relation: 'treated_with' });
    }
  }

  // 번식 이벤트 / 임신감정 / 분만
  const breeding = await db
    .select({
      eventId: breedingEvents.eventId,
      type: breedingEvents.type,
      eventDate: breedingEvents.eventDate,
      semenInfo: breedingEvents.semenInfo,
      status: breedingEvents.status,
    })
    .from(breedingEvents)
    .where(and(eq(breedingEvents.animalId, animalId), gte(breedingEvents.eventDate, since)))
    .orderBy(sql`${breedingEvents.eventDate} desc`)
    .limit(20);
  for (const b of breeding) {
    const id = `breeding_event:${b.eventId}`;
    nodes.push({
      id,
      type: 'breeding_event',
      label: `번식: ${b.type}${b.semenInfo ? ` (${b.semenInfo})` : ''}`,
      occurredAt: b.eventDate.toISOString(),
      props: { type: b.type, semenInfo: b.semenInfo, status: b.status },
    });
    edges.push({ from: id, to: anchorId, relation: 'bred' });
  }

  const checks = await db
    .select({
      checkId: pregnancyChecks.checkId,
      result: pregnancyChecks.result,
      method: pregnancyChecks.method,
      checkDate: pregnancyChecks.checkDate,
      daysPostInsemination: pregnancyChecks.daysPostInsemination,
    })
    .from(pregnancyChecks)
    .where(and(eq(pregnancyChecks.animalId, animalId), gte(pregnancyChecks.checkDate, since)))
    .orderBy(sql`${pregnancyChecks.checkDate} desc`)
    .limit(10);
  for (const c of checks) {
    const id = `pregnancy_check:${c.checkId}`;
    nodes.push({
      id,
      type: 'pregnancy_check',
      label: `임신감정: ${c.result} (${c.method})`,
      occurredAt: c.checkDate.toISOString(),
      props: { result: c.result, method: c.method, daysPostInsemination: c.daysPostInsemination },
    });
    edges.push({ from: id, to: anchorId, relation: 'checked' });
  }

  const calvings = await db
    .select({
      eventId: calvingEvents.eventId,
      calvingDate: calvingEvents.calvingDate,
      calfSex: calvingEvents.calfSex,
      calfStatus: calvingEvents.calfStatus,
    })
    .from(calvingEvents)
    .where(and(eq(calvingEvents.animalId, animalId), gte(calvingEvents.calvingDate, since)))
    .limit(5);
  for (const c of calvings) {
    const id = `calving:${c.eventId}`;
    nodes.push({
      id,
      type: 'calving',
      label: `분만${c.calfSex ? ` (${c.calfSex})` : ''}`,
      occurredAt: c.calvingDate.toISOString(),
      props: { calfSex: c.calfSex, calfStatus: c.calfStatus },
    });
    edges.push({ from: id, to: anchorId, relation: 'calved' });
  }

  // CowTalk AI 판단 (소버린 등)
  const preds = await db
    .select({
      predictionId: predictions.predictionId,
      engineType: predictions.engineType,
      label: predictions.predictionLabel,
      severity: predictions.severity,
      confidence: predictions.confidence,
      timestamp: predictions.timestamp,
    })
    .from(predictions)
    .where(and(eq(predictions.animalId, animalId), gte(predictions.timestamp, since)))
    .orderBy(sql`${predictions.timestamp} desc`)
    .limit(15);
  for (const p of preds) {
    const id = `prediction:${p.predictionId}`;
    nodes.push({
      id,
      type: 'prediction',
      label: `AI 판단: ${p.label} (${p.severity})`,
      occurredAt: p.timestamp.toISOString(),
      props: { engineType: p.engineType, severity: p.severity, confidence: p.confidence },
    });
    edges.push({ from: id, to: anchorId, relation: 'predicted_for' });
  }

  // 레이블 (정답 — 학습 루프의 산출물)
  const labels = await db
    .select({
      labelId: eventLabels.labelId,
      eventId: eventLabels.eventId,
      verdict: eventLabels.verdict,
      actualDiagnosis: eventLabels.actualDiagnosis,
      predictedType: eventLabels.predictedType,
    })
    .from(eventLabels)
    .where(eq(eventLabels.animalId, animalId))
    .limit(15);
  for (const l of labels) {
    const id = `label:${l.labelId}`;
    nodes.push({
      id,
      type: 'label',
      label: `레이블: ${l.verdict}${l.actualDiagnosis ? ` — ${l.actualDiagnosis}` : ''}`,
      props: { verdict: l.verdict, actualDiagnosis: l.actualDiagnosis, predictedType: l.predictedType },
    });
    // 대응 sensor_event 노드가 조회 창 안에 있으면 연결됨 (없으면 assemble에서 제거)
    edges.push({ from: id, to: `sensor_event:${l.eventId}`, relation: 'labels' });
  }

  // 이동 이력 (역학 접촉 경로) — 농장 노드 포함
  const transfers = await db
    .select({
      transferId: animalTransfers.transferId,
      sourceFarmId: animalTransfers.sourceFarmId,
      destinationFarmId: animalTransfers.destinationFarmId,
      transferDate: animalTransfers.transferDate,
      reason: animalTransfers.reason,
    })
    .from(animalTransfers)
    .where(eq(animalTransfers.animalId, animalId))
    .orderBy(sql`${animalTransfers.transferDate} desc`)
    .limit(10);
  if (transfers.length > 0) {
    const farmIds = [...new Set(transfers.flatMap((t) => [t.sourceFarmId, t.destinationFarmId]))];
    const transferFarms = await db
      .select({ farmId: farms.farmId, name: farms.name })
      .from(farms)
      .where(inArray(farms.farmId, farmIds));
    for (const f of transferFarms) {
      nodes.push({ id: `farm:${f.farmId}`, type: 'farm', label: f.name, props: {} });
    }
    for (const t of transfers) {
      const id = `transfer:${t.transferId}`;
      nodes.push({
        id,
        type: 'transfer',
        label: `이동 (${t.reason})`,
        occurredAt: t.transferDate.toISOString(),
        props: { reason: t.reason },
      });
      edges.push({ from: id, to: `farm:${t.sourceFarmId}`, relation: 'moved_from' });
      edges.push({ from: id, to: `farm:${t.destinationFarmId}`, relation: 'moved_to' });
      edges.push({ from: id, to: anchorId, relation: 'moves' });
    }
  }

  const graph = assembleGraph(anchorId, nodes, edges, windowDays);
  logger.debug(
    { animalId, nodes: graph.nodes.length, edges: graph.edges.length, windowDays },
    '[Ontology] 개체 그래프 조회',
  );
  return graph;
}

// ===========================
// 농장 앵커 그래프 — 개체 요약 + 이동 연결 농장 (역학용)
// ===========================

export async function resolveFarmGraph(
  farmId: string,
  opts: { readonly windowDays?: number } = {},
): Promise<OntologyGraph | null> {
  const db = getDb();
  const windowDays = Math.min(opts.windowDays ?? 90, 365);
  const since = new Date(Date.now() - windowDays * MS_PER_DAY);

  const [farm] = await db
    .select({ farmId: farms.farmId, name: farms.name, address: farms.address, headCount: farms.currentHeadCount })
    .from(farms)
    .where(eq(farms.farmId, farmId))
    .limit(1);
  if (!farm) return null;

  const anchorId = `farm:${farm.farmId}`;
  const nodes: OntologyNode[] = [
    { id: anchorId, type: 'farm', label: farm.name, props: { address: farm.address, headCount: farm.headCount } },
  ];
  const edges: OntologyEdge[] = [];

  // 최근 이상 개체 (심각 이벤트 보유) — 농장 그래프는 요약 수준
  const recentEvents = await db
    .select({
      eventId: smaxtecEvents.eventId,
      animalId: smaxtecEvents.animalId,
      eventType: smaxtecEvents.eventType,
      severity: smaxtecEvents.severity,
      detectedAt: smaxtecEvents.detectedAt,
      earTag: animals.earTag,
    })
    .from(smaxtecEvents)
    .leftJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
    .where(and(
      eq(smaxtecEvents.farmId, farmId),
      gte(smaxtecEvents.detectedAt, since),
      inArray(smaxtecEvents.severity, ['critical', 'high']),
    ))
    .orderBy(sql`${smaxtecEvents.detectedAt} desc`)
    .limit(30);
  const seenAnimals = new Set<string>();
  for (const e of recentEvents) {
    if (e.animalId && !seenAnimals.has(e.animalId)) {
      seenAnimals.add(e.animalId);
      nodes.push({
        id: `animal:${e.animalId}`,
        type: 'animal',
        label: `개체 ${e.earTag ?? e.animalId.slice(0, 8)}`,
        props: { earTag: e.earTag },
      });
      edges.push({ from: `animal:${e.animalId}`, to: anchorId, relation: 'belongs_to' });
    }
    const id = `sensor_event:${e.eventId}`;
    nodes.push({
      id,
      type: 'sensor_event',
      label: `${e.eventType} (${e.severity})`,
      occurredAt: e.detectedAt.toISOString(),
      props: { eventType: e.eventType, severity: e.severity },
    });
    if (e.animalId) edges.push({ from: id, to: `animal:${e.animalId}`, relation: 'detected_on' });
  }

  // 이동으로 연결된 농장 (접촉 네트워크 1-hop)
  const transfers = await db
    .select({
      transferId: animalTransfers.transferId,
      sourceFarmId: animalTransfers.sourceFarmId,
      destinationFarmId: animalTransfers.destinationFarmId,
      transferDate: animalTransfers.transferDate,
      reason: animalTransfers.reason,
      headCount: animalTransfers.headCount,
    })
    .from(animalTransfers)
    .where(and(
      or(eq(animalTransfers.sourceFarmId, farmId), eq(animalTransfers.destinationFarmId, farmId)),
      gte(animalTransfers.transferDate, since),
    ))
    .orderBy(sql`${animalTransfers.transferDate} desc`)
    .limit(30);
  if (transfers.length > 0) {
    const otherIds = [...new Set(transfers.flatMap((t) => [t.sourceFarmId, t.destinationFarmId]))]
      .filter((id) => id !== farmId);
    if (otherIds.length > 0) {
      const otherFarms = await db
        .select({ farmId: farms.farmId, name: farms.name })
        .from(farms)
        .where(inArray(farms.farmId, otherIds));
      for (const f of otherFarms) {
        nodes.push({ id: `farm:${f.farmId}`, type: 'farm', label: f.name, props: {} });
      }
    }
    for (const t of transfers) {
      const id = `transfer:${t.transferId}`;
      nodes.push({
        id,
        type: 'transfer',
        label: `이동 ${t.headCount}두 (${t.reason})`,
        occurredAt: t.transferDate.toISOString(),
        props: { reason: t.reason, headCount: t.headCount },
      });
      edges.push({ from: id, to: `farm:${t.sourceFarmId}`, relation: 'moved_from' });
      edges.push({ from: id, to: `farm:${t.destinationFarmId}`, relation: 'moved_to' });
    }
  }

  return assembleGraph(anchorId, nodes, edges, windowDays);
}
