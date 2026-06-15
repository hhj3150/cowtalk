// 자동 마이그레이션 — 파일별 격리 테스트
// 핵심: 한 마이그레이션 파일이 실패해도(과거 비멱등 파일 재실행 throw 등)
//       이후 파일이 막히지 않고 계속 적용돼야 한다. (0015 poison-pill 재발 방지)

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { applyMigrations, sanitizeMigration } from '../auto-migrate.js';

describe('applyMigrations — 파일별 격리', () => {
  it('한 파일이 throw해도 이후 파일을 계속 적용한다', async () => {
    const run = vi.fn(async (sql: string) => {
      if (sql.includes('BOOM')) throw new Error('relation already exists');
    });
    const files = [
      { name: '0001.sql', sql: 'CREATE A' },
      { name: '0015.sql', sql: 'CREATE BOOM' },   // 과거 비멱등 파일 시뮬레이션
      { name: '0021.sql', sql: 'CREATE Z' },       // 막히면 안 됨
    ];

    const summary = await applyMigrations(files, run);

    expect(run).toHaveBeenCalledTimes(3);            // 모든 파일 시도
    expect(summary.applied).toBe(2);
    expect(summary.failed).toEqual(['0015.sql']);
  });

  it('모두 성공하면 failed가 비어 있다', async () => {
    const run = vi.fn(async () => {});
    const summary = await applyMigrations(
      [{ name: '0001.sql', sql: 'A' }, { name: '0002.sql', sql: 'B' }],
      run,
    );
    expect(summary.applied).toBe(2);
    expect(summary.failed).toEqual([]);
  });

  it('파일 순서대로 적용한다', async () => {
    const order: string[] = [];
    const run = vi.fn(async (sql: string) => { order.push(sql); });
    await applyMigrations(
      [{ name: 'a', sql: 'X' }, { name: 'b', sql: 'Y' }, { name: 'c', sql: 'Z' }],
      run,
    );
    expect(order).toEqual(['X', 'Y', 'Z']);
  });
});

describe('sanitizeMigration — TimescaleDB 미설치 대응', () => {
  it('timescaledb extension / hypertable 구문을 주석 처리한다', () => {
    const out = sanitizeMigration(
      'CREATE EXTENSION IF NOT EXISTS "timescaledb";\nSELECT create_hypertable(\'t\',\'ts\');\nCREATE TABLE x();',
    );
    expect(out).not.toContain('create_hypertable(');
    expect(out).not.toMatch(/EXTENSION IF NOT EXISTS "timescaledb"/);
    expect(out).toContain('CREATE TABLE x()');
  });
});
