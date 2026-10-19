// AI-02 회귀 — 알람이 실제로 울리지 않았는데 smaXtec 이벤트마다 '확진' 레이블을 대량 생성하던 문제
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const labelInserts: Array<Record<string, unknown>> = [];
let firedAlarms: Array<{ prediction_id: string; created_at: string }> = [];
const EVENT = { animalId: 'cow-1', farmId: 'farm-1', eventType: 'health_warning', detectedAt: new Date('2026-10-18T09:00:00Z') };

vi.mock('../../config/database.js', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [EVENT] }) }) }) }),
    execute: async () => firedAlarms,
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        labelInserts.push(v);
        return { onConflictDoNothing: () => ({ returning: async () => [{ labelId: 'l' }] }) };
      },
    }),
  }),
}));
vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../outcome-recorder.js', () => ({ recordOutcome: vi.fn(async () => undefined) }));

const { runAutoLabeling } = await import('../auto-labeler.service.js');
const { isLegacyBlindAutoLabel, learnableLabelCondition, MATCHED_AUTO_LABEL_PREFIX } = await import('../label-source.js');

beforeEach(() => { labelInserts.length = 0; firedAlarms = []; });

describe('AI-02 runAutoLabeling', () => {
  it('발사된 알람이 없으면 레이블을 만들지 않는다 (예전: health_warning 1건 → 35건)', async () => {
    const r = await runAutoLabeling(3);
    expect(labelInserts).toHaveLength(0);
    expect(r.labelsCreated).toBe(0);
  });

  it('발사된 알람과 매칭되면 그 알람 날짜 시그니처로 확진 1건씩', async () => {
    firedAlarms = [{ prediction_id: 'p1', created_at: '2026-10-16T05:00:00Z' }];
    await runAutoLabeling(3);
    // health_warning → 알람 유형 5종 각각 같은 예측 목(mock)이 1건 반환됨
    expect(labelInserts.length).toBe(5);
    expect(labelInserts[0]!.alarmSignature).toBe('cow-1:ketosis_risk:2026-10-16');
    expect(String(labelInserts[0]!.notes)).toContain(MATCHED_AUTO_LABEL_PREFIX);
  });
});

describe('AI-02 학습 제외 조건', () => {
  it('옛 무차별 자동 레이블을 식별', () => {
    expect(isLegacyBlindAutoLabel('자동 레이블: smaXtec health_warning 이벤트 (2026-10-01)')).toBe(true);
    expect(isLegacyBlindAutoLabel(`${MATCHED_AUTO_LABEL_PREFIX} 2026-10-16 알람`)).toBe(false);
    expect(isLegacyBlindAutoLabel(null)).toBe(false);
    expect(isLegacyBlindAutoLabel('수의사 확진')).toBe(false);
  });

  it('SQL 조건은 접두어를 파라미터로 바인딩해 NOT LIKE 로 제외한다', () => {
    const q = new PgDialect().sqlToQuery(learnableLabelCondition());
    expect(q.sql).toContain('NOT LIKE');
    expect(q.params).toContain('자동 레이블: smaXtec%');
  });
});
