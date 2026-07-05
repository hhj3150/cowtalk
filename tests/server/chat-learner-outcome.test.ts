// 팅커벨 학습 루프 — 신호 추출(순수 함수) + outcome 예후 연결(DB 종단 루프)

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { extractLearningSignals, saveChatConversation } from '@server/chat/chat-learner.js';
import { getDb, closeDb } from '@server/config/database.js';
import {
  regions, farms, users, animals, smaxtecEvents, eventLabels, labelFollowUps,
  chatConversations, animalEvents,
} from '@server/db/schema.js';
import { eq } from 'drizzle-orm';

describe('extractLearningSignals — 한국어 패턴 추출', () => {
  it('진단 신호', () => {
    const signals = extractLearningSignals('423번이 유방염인 것 같아');
    expect(signals.some((s) => s.type === 'diagnosis' && s.value === '유방염')).toBe(true);
  });

  it('치료 신호 — 약물명 + 용량', () => {
    const signals = extractLearningSignals('페니실린 20ml 주사했어');
    const t = signals.find((s) => s.type === 'treatment');
    expect(t).toBeDefined();
    expect(t!.value).toContain('페니실린');
  });

  it('outcome 신호 — 회복', () => {
    const signals = extractLearningSignals('그 소 이제 다 나았어요');
    expect(signals.some((s) => s.type === 'outcome' && s.value === 'recovered')).toBe(true);
  });

  it('outcome 신호 — 악화', () => {
    const signals = extractLearningSignals('상태가 더 악화됐어');
    expect(signals.some((s) => s.type === 'outcome' && s.value === 'worsened')).toBe(true);
  });

  it('일반 문장 — 신호 없음', () => {
    expect(extractLearningSignals('오늘 날씨 어때?')).toHaveLength(0);
  });
});

describe('outcome 예후 → 레이블 연결 (종단 학습 루프)', () => {
  const USER_ID = '33333333-aaaa-4bbb-8ccc-000000000001';
  let regionId: string;
  let farmId: string;
  let animalId: string;
  let eventId: string;
  let labelId: string;

  beforeAll(async () => {
    const db = getDb();
    const [region] = await db.insert(regions).values({
      province: '테스트도', district: '루프군', code: `L${String(Date.now()).slice(-8)}`,
    }).returning();
    regionId = region!.regionId;
    const [farm] = await db.insert(farms).values({
      regionId, name: '루프테스트목장', address: '주소', lat: 37, lng: 127,
    }).returning();
    farmId = farm!.farmId;
    const [animal] = await db.insert(animals).values({
      farmId, earTag: `L-${String(Date.now()).slice(-6)}`,
    }).returning();
    animalId = animal!.animalId;
    await db.insert(users).values({
      userId: USER_ID, name: '루프수의사', email: `loop-vet-${Date.now()}@test.local`,
      passwordHash: 'x', role: 'veterinarian',
    });

    const [event] = await db.insert(smaxtecEvents).values({
      animalId, farmId, eventType: 'temperature_high', detectedAt: new Date(),
    }).returning();
    eventId = event!.eventId;

    const [label] = await db.insert(eventLabels).values({
      eventId, animalId, farmId,
      predictedType: 'temperature_high', predictedSeverity: 'high',
      verdict: 'confirmed', actualDiagnosis: '유방염', labeledBy: USER_ID,
      labeledAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3일 전 레이블
    }).returning();
    labelId = label!.labelId;
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(labelFollowUps).where(eq(labelFollowUps.labelId, labelId));
    await db.delete(eventLabels).where(eq(eventLabels.labelId, labelId));
    await db.delete(chatConversations).where(eq(chatConversations.userId, USER_ID));
    await db.delete(animalEvents).where(eq(animalEvents.animalId, animalId));
    await db.delete(smaxtecEvents).where(eq(smaxtecEvents.eventId, eventId));
    await db.delete(animals).where(eq(animals.animalId, animalId));
    await db.delete(users).where(eq(users.userId, USER_ID));
    await db.delete(farms).where(eq(farms.farmId, farmId));
    await db.delete(regions).where(eq(regions.regionId, regionId));
    await closeDb();
  });

  it('"나았어요" 한 마디가 label_follow_ups 예후 + event_labels.outcome 갱신으로 이어진다', async () => {
    await saveChatConversation({
      userId: USER_ID,
      role: 'veterinarian',
      animalId,
      farmId,
      question: '그 소 이제 완치됐어요',
      answer: '회복 기록했습니다.',
      contextType: 'animal',
    });

    const db = getDb();
    const followUps = await db.select().from(labelFollowUps).where(eq(labelFollowUps.labelId, labelId));
    expect(followUps).toHaveLength(1);
    expect(followUps[0]!.status).toBe('recovered');
    expect(followUps[0]!.daysSinceLabel).toBeGreaterThanOrEqual(2);

    const [label] = await db.select().from(eventLabels).where(eq(eventLabels.labelId, labelId));
    expect(label!.outcome).toBe('resolved');
  });
});
