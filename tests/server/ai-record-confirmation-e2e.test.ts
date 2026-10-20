// Phase 5 통합 검증 — AI 기록 저장 종단 시험 (실제 DB · 실제 게이트웨이 · 실제 실행기)
// 대화로 진료 기록을 남길 때: 1차 호출은 제안만, 사용자 '다음 발화'가 명시적 승인일 때만 저장.
// "저장하지 마"는 절대 저장하지 않는다. 같은 확인으로 두 번 저장되지 않는다.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { getDb, closeDb } from '@server/config/database.js';
import { regions, farms, animals, users, userFarmAccess, healthEvents, treatments } from '@server/db/schema.js';
import { executeToolWithGateway } from '@server/ai-brain/tools/tool-gateway.js';

const RUN = String(Date.now()).slice(-7);
const USER = randomUUID();
let regionId = ''; let farmId = ''; let animalId = '';

beforeAll(async () => {
  const db = getDb();
  const [r] = await db.insert(regions).values({ province: '테스트도', district: '기록군', code: `R${RUN}` }).returning();
  regionId = r!.regionId;
  const [f] = await db.insert(farms).values({ regionId, name: `기록목장${RUN}`, address: '주소', lat: 37, lng: 127 }).returning();
  farmId = f!.farmId;
  const [a] = await db.insert(animals).values({ farmId, earTag: `REC${RUN}`, status: 'active' }).returning();
  animalId = a!.animalId;
  await db.insert(users).values({ userId: USER, name: '기록수의사', email: `rec-${RUN}@test.local`, passwordHash: 'x', role: 'veterinarian', approvalStatus: 'approved' } as never);
  await db.insert(userFarmAccess).values({ userId: USER, farmId } as never);
}, 60_000);

afterAll(async () => {
  const db = getDb();
  const evs = await db.select({ id: healthEvents.eventId }).from(healthEvents).where(eq(healthEvents.animalId, animalId));
  if (evs.length > 0) await db.delete(treatments).where(inArray(treatments.healthEventId, evs.map((e) => e.id))).catch(() => undefined);
  await db.delete(healthEvents).where(eq(healthEvents.animalId, animalId)).catch(() => undefined);
  await db.delete(userFarmAccess).where(eq(userFarmAccess.userId, USER)).catch(() => undefined);
  await closeDb();
});

const input = () => ({ animalId, diagnosis: '유방염', drug: '세프티오퍼', dosage: '20ml', route: 'intramammary', withdrawalDays: 3, affectedQuarter: 'LF', cmtResult: '++' });
const ctx = (turnId: string, userUtterance: string) => ({
  role: 'veterinarian' as const, userId: USER, farmId, assignedFarmIds: [farmId], confirmationTurn: { turnId, userUtterance },
});
async function savedCount(): Promise<number> {
  return (await getDb().select({ id: healthEvents.eventId }).from(healthEvents).where(eq(healthEvents.animalId, animalId))).length;
}

describe('AI 진료 기록 확인 게이트 (실제 DB)', () => {
  it('제안 → "저장하지 마" → 저장 안 됨 → 새 제안 → "저장해" → 1건 저장 → 같은 확인 재사용은 무시', async () => {
    // 1) 1차 호출: 제안만
    const p1 = JSON.parse((await executeToolWithGateway('record_treatment', input(), ctx(randomUUID(), '423번 유방염 치료 기록해줘'))).result) as { confirmationRequired: boolean; confirmationId: string; summary: string };
    expect(p1.confirmationRequired).toBe(true);
    expect(p1.summary).toContain('CMT 결과: ++');
    expect(p1.summary).toContain('이환 분방: 좌전 (LF)');
    expect(await savedCount()).toBe(0);

    // 2) 사용자가 "저장하지 마" — AI 가 confirmationId 로 다시 불러도 저장 안 됨
    const deny = JSON.parse((await executeToolWithGateway('record_treatment', { ...input(), confirmationId: p1.confirmationId }, ctx(randomUUID(), '저장하지 마'))).result) as { cancelled?: boolean };
    expect(deny.cancelled).toBe(true);
    expect(await savedCount()).toBe(0);

    // 3) 새 제안 → 같은 턴에 AI 스스로 확인하면 거부
    const t3 = randomUUID();
    const p2 = JSON.parse((await executeToolWithGateway('record_treatment', input(), ctx(t3, '다시 기록해줘'))).result) as { confirmationId: string };
    await executeToolWithGateway('record_treatment', { ...input(), confirmationId: p2.confirmationId }, ctx(t3, '다시 기록해줘'));
    expect(await savedCount()).toBe(0);

    // 4) 다음 발화 "저장해" → 1건 저장 (진료 이벤트 + 처치)
    const ok = await executeToolWithGateway('record_treatment', { ...input(), confirmationId: p2.confirmationId }, ctx(randomUUID(), '저장해'));
    expect(ok.success).toBe(true);
    expect(await savedCount()).toBe(1);
    const [ev] = await getDb().select({ id: healthEvents.eventId }).from(healthEvents).where(eq(healthEvents.animalId, animalId));
    const tr = await getDb().select().from(treatments).where(eq(treatments.healthEventId, ev!.id));
    expect(tr).toHaveLength(1);
    expect(tr[0]!.withdrawalDays).toBe(3);

    // 5) 같은 확인 재사용(재시도·중복 호출) → 추가 저장 없음
    await executeToolWithGateway('record_treatment', { ...input(), confirmationId: p2.confirmationId }, ctx(randomUUID(), '저장해'));
    expect(await savedCount()).toBe(1);
  }, 60_000);
});
