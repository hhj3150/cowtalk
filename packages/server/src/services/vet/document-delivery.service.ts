// 수의사 진료센터 — 5단계 보내기: 발행 문서를 농장(농장주)에게 전달하고 이력 영속화.
// 발송 사실(DB)이 진실의 원천. 푸시는 best-effort(설정/구독 없으면 0건이어도 정상).
import { getDb } from '../../config/database.js';
import { veterinaryDocumentDeliveries, veterinaryVisits, animals, farms } from '../../db/schema.js';
import { eq, desc, inArray } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import { sendPushToFarm } from '../../realtime/push-service.js';
import { VET_DOC_TITLES, type VetDocType } from './document-builder.service.js';

export interface SendDocumentInput {
  readonly visitId: string;
  readonly farmId: string;
  readonly docType: VetDocType;
  readonly sentBy: string;
  readonly note?: string;
}

export interface SendDocumentResult {
  readonly deliveryId: string;
  readonly pushDelivered: number;
}

export async function sendDocument(input: SendDocumentInput): Promise<SendDocumentResult> {
  const db = getDb();
  const [farm] = await db.select({ name: farms.name, ownerName: farms.ownerName })
    .from(farms).where(eq(farms.farmId, input.farmId)).limit(1);
  const recipientName = farm?.ownerName ?? null;
  const docTitle = VET_DOC_TITLES[input.docType];

  // 푸시 best-effort (실패해도 전달 기록은 남긴다)
  let pushDelivered = 0;
  try {
    pushDelivered = await sendPushToFarm(input.farmId, {
      title: `📄 ${docTitle} 도착`,
      body: `담당 수의사가 ${docTitle}를 발행했습니다.${input.note ? ` (${input.note})` : ''}`,
      severity: 'high',
      url: '/',
    });
  } catch (err) {
    logger.warn({ err, farmId: input.farmId }, '[VetCenter] 문서 전달 푸시 실패(전달 기록은 유지)');
  }

  const [row] = await db.insert(veterinaryDocumentDeliveries).values({
    visitId: input.visitId,
    farmId: input.farmId,
    docType: input.docType,
    sentBy: input.sentBy,
    recipientName,
    channel: 'in_app',
    note: input.note ?? null,
    status: 'sent',
    pushDelivered,
  }).returning({ deliveryId: veterinaryDocumentDeliveries.deliveryId });

  logger.info(
    { visitId: input.visitId, docType: input.docType, farmId: input.farmId, pushDelivered },
    '[VetCenter] 문서 전달 기록',
  );
  return { deliveryId: row!.deliveryId, pushDelivered };
}

export async function listDeliveries(visitId: string): Promise<unknown[]> {
  const db = getDb();
  const rows = await db.select().from(veterinaryDocumentDeliveries)
    .where(eq(veterinaryDocumentDeliveries.visitId, visitId))
    .orderBy(desc(veterinaryDocumentDeliveries.sentAt))
    .limit(100);
  return rows.map((r) => ({
    delivery_id: r.deliveryId,
    doc_type: r.docType,
    doc_title: VET_DOC_TITLES[r.docType as VetDocType] ?? r.docType,
    recipient_name: r.recipientName,
    channel: r.channel,
    note: r.note,
    status: r.status,
    push_delivered: r.pushDelivered,
    sent_at: r.sentAt,
  }));
}

// ── 농장주 수신함 ──

// 농장주 농장에 전달된 문서 목록 (개체·진단 요약 포함)
export async function listFarmerDeliveries(farmIds: readonly string[]): Promise<unknown[]> {
  if (farmIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      deliveryId: veterinaryDocumentDeliveries.deliveryId,
      docType: veterinaryDocumentDeliveries.docType,
      note: veterinaryDocumentDeliveries.note,
      status: veterinaryDocumentDeliveries.status,
      sentAt: veterinaryDocumentDeliveries.sentAt,
      visitId: veterinaryDocumentDeliveries.visitId,
      finalDiagnosis: veterinaryVisits.finalDiagnosis,
      visitDatetime: veterinaryVisits.visitDatetime,
      earTag: animals.earTag,
    })
    .from(veterinaryDocumentDeliveries)
    .innerJoin(veterinaryVisits, eq(veterinaryDocumentDeliveries.visitId, veterinaryVisits.visitId))
    .leftJoin(animals, eq(veterinaryVisits.animalId, animals.animalId))
    .where(inArray(veterinaryDocumentDeliveries.farmId, [...farmIds]))
    .orderBy(desc(veterinaryDocumentDeliveries.sentAt))
    .limit(200);
  return rows.map((r) => ({
    delivery_id: r.deliveryId,
    doc_type: r.docType,
    doc_title: VET_DOC_TITLES[r.docType as VetDocType] ?? r.docType,
    note: r.note,
    status: r.status,
    sent_at: r.sentAt,
    visit_id: r.visitId,
    ear_tag_number: r.earTag ?? null,
    final_diagnosis: r.finalDiagnosis ?? null,
    visit_datetime: r.visitDatetime,
  }));
}

// 전달 단건 — 접근검증 + 문서 빌드에 필요한 식별자
export interface DeliveryRef {
  readonly deliveryId: string;
  readonly visitId: string;
  readonly docType: VetDocType;
  readonly farmId: string;
  readonly status: string;
}
export async function getDeliveryRef(deliveryId: string): Promise<DeliveryRef | null> {
  const db = getDb();
  const [r] = await db.select({
    deliveryId: veterinaryDocumentDeliveries.deliveryId,
    visitId: veterinaryDocumentDeliveries.visitId,
    docType: veterinaryDocumentDeliveries.docType,
    farmId: veterinaryDocumentDeliveries.farmId,
    status: veterinaryDocumentDeliveries.status,
  }).from(veterinaryDocumentDeliveries)
    .where(eq(veterinaryDocumentDeliveries.deliveryId, deliveryId)).limit(1);
  if (!r) return null;
  return { ...r, docType: r.docType as VetDocType };
}

// 농장주 수신 확인 — 전달 상태 + 진료기록 farmerAcknowledged 갱신
export async function acknowledgeDelivery(deliveryId: string, visitId: string): Promise<void> {
  const db = getDb();
  await db.update(veterinaryDocumentDeliveries)
    .set({ status: 'acknowledged' })
    .where(eq(veterinaryDocumentDeliveries.deliveryId, deliveryId));
  await db.update(veterinaryVisits)
    .set({ farmerAcknowledged: true, farmerAcknowledgedAt: new Date() })
    .where(eq(veterinaryVisits.visitId, visitId));
  logger.info({ deliveryId, visitId }, '[VetCenter] 농장주 문서 수신 확인');
}
