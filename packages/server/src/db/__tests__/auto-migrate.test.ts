// 자동 마이그레이션 — 파일별 격리 테스트
// 핵심: 한 마이그레이션 파일이 실패해도(과거 비멱등 파일 재실행 throw 등)
//       이후 파일이 막히지 않고 계속 적용돼야 한다. (0015 poison-pill 재발 방지)

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { applyMigrations, sanitizeMigration, migrationChecksum } from '../auto-migrate.js';
import type { MigrationTracker } from '../auto-migrate.js';

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

// SEC-03 회귀 — 성공한 마이그레이션은 다시 실행하지 않는다
function memTracker(initial: Record<string, string> = {}): MigrationTracker & { rows: Map<string, string> } {
  const rows = new Map(Object.entries(initial));
  return {
    rows,
    loadApplied: async () => new Map(rows),
    record: async (name, checksum) => { rows.set(name, checksum); },
  };
}

describe('applyMigrations — 적용 이력 추적 (SEC-03)', () => {
  const approvalSql = "UPDATE users SET approval_status = 'approved' WHERE ...";

  it('두 번째 부팅에서는 이미 적용된 파일(데이터 변경 포함)을 실행하지 않는다', async () => {
    const tracker = memTracker();
    const run = vi.fn(async () => {});
    const files = [{ name: '0032_user_approval.sql', sql: approvalSql }, { name: '0033.sql', sql: 'B' }];

    const first = await applyMigrations(files, run, tracker);
    expect(first).toEqual({ applied: 2, failed: [], skipped: 0 });

    run.mockClear();
    const second = await applyMigrations(files, run, tracker);
    expect(run).not.toHaveBeenCalled();
    expect(second).toEqual({ applied: 0, failed: [], skipped: 2 });
  });

  it('실패한 파일은 기록하지 않아 다음 부팅에 다시 시도한다', async () => {
    const tracker = memTracker();
    let broken = true;
    const run = vi.fn(async (sql: string) => { if (sql === 'BOOM' && broken) throw new Error('x'); });
    const files = [{ name: 'a.sql', sql: 'BOOM' }];
    await applyMigrations(files, run, tracker);
    expect(tracker.rows.has('a.sql')).toBe(false);
    broken = false;
    const s2 = await applyMigrations(files, run, tracker);
    expect(s2.applied).toBe(1);
    expect(tracker.rows.has('a.sql')).toBe(true);
  });

  it('새로 추가된 파일만 실행한다', async () => {
    const tracker = memTracker({ 'old.sql': migrationChecksum('OLD') });
    const order: string[] = [];
    await applyMigrations([{ name: 'old.sql', sql: 'OLD' }, { name: 'new.sql', sql: 'NEW' }], async (s) => { order.push(s); }, tracker);
    expect(order).toEqual(['NEW']);
  });

  it('적용 후 내용이 바뀐 파일도 재실행하지 않는다 (경고만)', async () => {
    const tracker = memTracker({ 'x.sql': migrationChecksum('V1') });
    const run = vi.fn(async () => {});
    const s = await applyMigrations([{ name: 'x.sql', sql: 'V2' }], run, tracker);
    expect(run).not.toHaveBeenCalled();
    expect(s.skipped).toBe(1);
  });

  it('이력 기록이 실패해도 다음 파일 적용은 계속된다', async () => {
    const tracker: MigrationTracker = {
      loadApplied: async () => new Map(),
      record: async () => { throw new Error('db down'); },
    };
    const run = vi.fn(async () => {});
    const s = await applyMigrations([{ name: 'a', sql: 'A' }, { name: 'b', sql: 'B' }], run, tracker);
    expect(run).toHaveBeenCalledTimes(2);
    expect(s.applied).toBe(2);
  });
});
