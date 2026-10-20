// OPS-10 회귀 — 센서 장착 수를 smaxtec_events 전 기간 COUNT(DISTINCT) 로 세던 문제
import { describe, it, expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sensorAttachedCondition } from '../unified-dashboard.routes.js';

describe('OPS-10 sensorAttachedCondition', () => {
  it('animals 테이블만 본다 (활성·미삭제·현재 센서 보유)', () => {
    const q = new PgDialect().sqlToQuery(sensorAttachedCondition()).sql;
    expect(q).toContain('"animals"."status"');
    expect(q).toContain('"animals"."deleted_at" is null');
    expect(q).toContain('"animals"."current_device_id" is not null');
    expect(q).not.toContain('smaxtec_events');
  });
});
