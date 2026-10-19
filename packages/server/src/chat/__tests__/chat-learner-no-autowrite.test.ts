// AI-01 회귀 — 대화 정규식이 확인 없이 진료·번식 기록을 만들던 뒷문
import { describe, it, expect, vi, beforeEach } from 'vitest';

const inserted: Array<{ table: string; values: unknown }> = [];
const updated: unknown[] = [];
let recentLabel: Array<{ labelId: string; eventId: string; labeledAt: Date }> = [];

vi.mock('../../config/database.js', () => ({
  getDb: () => ({
    insert: (table: { _: { name: string } } | unknown) => ({
      values: (v: unknown) => {
        const name = (table as { [k: symbol]: string })[Symbol.for('drizzle:Name')] ?? 'unknown';
        inserted.push({ table: String(name), values: v });
        const p = Promise.resolve() as Promise<void> & { returning: () => Promise<Array<{ id: string }>> };
        p.returning = async () => [{ id: 'conv-1' }];
        return p;
      },
    }),
    update: () => ({ set: (v: unknown) => { updated.push(v); return { where: async () => undefined }; } }),
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => recentLabel }) }) }) }),
  }),
}));
vi.mock('../memory/memory.service.js', () => ({ rememberFromConversation: vi.fn(async () => undefined) }));
vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { extractLearningSignals, saveChatConversation, isFactStatement } = await import('../chat-learner.js');

const COW = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FARM = '11111111-1111-4111-8111-111111111111';
const base = { userId: 'u1', animalId: COW, farmId: FARM, answer: 'ok', contextType: 'animal' };

beforeEach(() => { inserted.length = 0; updated.length = 0; recentLabel = []; });

describe('AI-01 질문·요청·부정문은 사실로 읽지 않는다', () => {
  it.each([
    '임신 확인해줘?', '임신 확인해줘', '수정했나요?', '수정 했어?', '분만했니?',
    '그 소 죽겠다는 거야?', '유방염인가요?', '423번 상태 보여줘',
  ])('신호 없음: %s', (t) => {
    expect(extractLearningSignals(t)).toHaveLength(0);
  });

  it.each(['아직 안 나았어', '수정 안 했어', '죽지 않았어'])('부정문은 예후·수정 신호 없음: %s', (t) => {
    const s = extractLearningSignals(t);
    expect(s.some((x) => x.type === 'outcome' || x.value === 'insemination')).toBe(false);
  });

  it("'팔'·'죽' 한 글자로 도태·폐사를 만들지 않는다", () => {
    expect(extractLearningSignals('팔다리가 부었어').some((x) => x.value === 'culled')).toBe(false);
    expect(extractLearningSignals('죽 같은 변을 봐').some((x) => x.value === 'dead')).toBe(false);
  });

  it('평서문 사실 진술은 여전히 신호로 잡힌다 (농장 패턴 요약용)', () => {
    expect(isFactStatement('페니실린 20ml 주사했어')).toBe(true);
    expect(extractLearningSignals('페니실린 20ml 주사했어').some((x) => x.type === 'treatment')).toBe(true);
    expect(extractLearningSignals('그 소 이제 다 나았어요').some((x) => x.value === 'recovered')).toBe(true);
  });
});

describe('AI-01 대화 저장은 진료·번식 기록을 만들지 않는다', () => {
  it('치료·분만·수정 진술이 있어도 대화 로그 외 기록 없음', async () => {
    for (const q of ['페니실린 20ml 주사했어', '송아지 낳았어', '오늘 수정했어', '자궁염이야']) {
      await saveChatConversation({ ...base, role: 'veterinarian', question: q });
    }
    expect(inserted.every((i) => i.table === 'chat_conversations')).toBe(true);
    expect(inserted).toHaveLength(4);
  });

  it('전문가의 예후 진술은 추적 메모만, 레이블 결과는 바꾸지 않는다', async () => {
    recentLabel = [{ labelId: 'l1', eventId: 'e1', labeledAt: new Date(Date.now() - 3 * 86_400_000) }];
    await saveChatConversation({ ...base, role: 'veterinarian', question: '그 소 이제 완치됐어요' });
    expect(inserted.some((i) => i.table === 'label_follow_ups')).toBe(true);
    expect(updated).toHaveLength(0);
  });

  it('농장주의 예후 진술은 추적 메모도 남기지 않는다', async () => {
    recentLabel = [{ labelId: 'l1', eventId: 'e1', labeledAt: new Date() }];
    await saveChatConversation({ ...base, role: 'farmer', question: '다 나았어요' });
    expect(inserted.some((i) => i.table === 'label_follow_ups')).toBe(false);
  });
});
