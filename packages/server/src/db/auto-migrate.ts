// 부팅 시 자동 마이그레이션 — 파일별 격리 실행
//
// 왜 분리/격리가 필요한가:
//   index.ts 의 기존 ensureMigrations 는 for-loop 전체를 하나의 try/catch 로 감쌌다.
//   그래서 비멱등 마이그레이션 한 개(예: 0015 의 CREATE INDEX without IF NOT EXISTS)가
//   재실행 시 "relation already exists" 로 throw 하면, 그 뒤 모든 파일(0019~0021…)이
//   매 부팅마다 영구히 스킵됐다(프로덕션에서 0019~0021 누락의 진짜 원인).
//
//   → 파일별 try/catch 로 바꿔, 한 파일이 실패해도 이후 파일은 계속 적용한다.
//
// SEC-03: 적용 이력(schema_migrations) 추적
//   예전엔 성공한 파일도 부팅마다 전부 다시 실행했다. 데이터 변경(UPDATE/DELETE)이 든 파일이
//   매 부팅 재실행되면 운영자가 바꾼 값(예: 차단한 계정의 승인 상태)이 되돌아간다.
//   → 성공한 파일은 이름·체크섬을 기록하고 다음 부팅부터 건너뛴다. 실패한 파일은 기록하지
//     않으므로 지금처럼 다음 부팅에 다시 시도된다. 기록이 없는 첫 부팅은 예전과 같이 전부 실행.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { getDatabaseUrl } from '../config/index.js';
import { logger } from '../lib/logger.js';

export interface MigrationFile {
  readonly name: string;
  readonly sql: string;
}

export interface MigrationSummary {
  readonly applied: number;
  readonly failed: readonly string[];
  /** 이미 적용 이력이 있어 건너뛴 파일 수 */
  readonly skipped: number;
}

/** 적용 이력 저장소 — 실제로는 schema_migrations 테이블, 테스트에선 메모리 */
export interface MigrationTracker {
  /** 이미 적용된 파일 이름 → 체크섬 */
  readonly loadApplied: () => Promise<ReadonlyMap<string, string>>;
  readonly record: (name: string, checksum: string) => Promise<void>;
}

export function migrationChecksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

// TimescaleDB 미설치 환경(예: Homebrew PG) 대응 — extension/hypertable 구문 제거.
// migrate.ts(CLI)와 동일 규칙.
export function sanitizeMigration(sql: string): string {
  return sql
    .replace(/CREATE EXTENSION IF NOT EXISTS "timescaledb";/g, '-- timescaledb skipped')
    .replace(/SELECT create_hypertable\([^)]+\);/g, '-- hypertable skipped');
}

// 파일별 격리 적용 — 한 파일이 throw 해도 이후 파일을 계속 적용한다.
// run 은 외부 주입(테스트 용이) — 실제로는 postgres unsafe 쿼리.
// tracker 가 있으면 이미 적용된 파일은 건너뛰고, 성공한 파일만 기록한다.
export async function applyMigrations(
  files: readonly MigrationFile[],
  run: (sql: string) => Promise<void>,
  tracker?: MigrationTracker,
): Promise<MigrationSummary> {
  const failed: string[] = [];
  let applied = 0;
  let skipped = 0;
  const done = tracker ? await tracker.loadApplied() : new Map<string, string>();

  for (const file of files) {
    const checksum = migrationChecksum(file.sql);
    const prev = done.get(file.name);
    if (prev !== undefined) {
      skipped += 1;
      if (prev !== checksum) {
        // 적용 후 파일이 바뀌었다 — 재실행하지 않는다(데이터 변경 재적용 위험). 새 변경은 새 파일로.
        logger.warn({ file: file.name }, '[Migrations] 적용된 파일 내용이 바뀜 — 재실행하지 않음 (새 마이그레이션 파일로 작성할 것)');
      }
      continue;
    }
    try {
      await run(sanitizeMigration(file.sql));
      applied += 1;
    } catch (err) {
      failed.push(file.name);
      logger.warn({ err, file: file.name }, '[Migrations] 파일 적용 실패 — 건너뛰고 다음 파일 계속');
      continue;
    }
    if (tracker) {
      try {
        await tracker.record(file.name, checksum);
      } catch (err) {
        // 기록 실패는 다음 부팅 재실행으로 이어질 뿐(예전 동작) — 부팅은 막지 않는다
        logger.warn({ err, file: file.name }, '[Migrations] 적용 이력 기록 실패 — 다음 부팅에 재실행될 수 있음');
      }
    }
  }

  return { applied, failed, skipped };
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function readMigrationFiles(dir: string): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(resolve(dir, name), 'utf-8') }));
}

// OPS-13: 레플리카 여러 개가 동시에 부팅해도 마이그레이션은 한 번에 하나만 (pg advisory lock)
export const MIGRATION_LOCK_KEY = 727_274_013;

export interface MigrationRunStatus {
  readonly ranAt: string;
  readonly total: number;
  readonly applied: number;
  readonly skipped: number;
  readonly failed: readonly string[];
  /** 연결·디렉터리 읽기 같은 전체 단위 오류 */
  readonly error: string | null;
}

let lastStatus: MigrationRunStatus | null = null;

/** OPS-13: 마지막 실행 결과 — 실패가 로그에만 남아 스키마 불일치를 모르던 문제 → 헬스체크에 노출 */
export function getMigrationStatus(): MigrationRunStatus | null {
  return lastStatus;
}

/** 실패가 하나라도 있으면 true — 엄격 모드(MIGRATIONS_STRICT)에서 기동 중단 판단에 쓴다 */
export function migrationsFailed(status: MigrationRunStatus | null): boolean {
  return status !== null && (status.error !== null || status.failed.length > 0);
}

// dist/db/migrations(또는 src) 전체를 파일별로 적용 — 부팅(index.ts)과 CLI(migrate.ts)가 같은 경로를 쓴다.
// 예외를 던지지 않고 결과를 돌려준다. 기동을 멈출지는 호출부가 결정한다.
export async function runMigrations(): Promise<MigrationRunStatus> {
  const dir = resolve(__dirname, 'migrations');
  // 연결 하나로 고정 — advisory lock 은 세션 단위라 같은 연결에서 잠그고 풀어야 한다
  const pgSql = postgres(getDatabaseUrl(), { max: 1, onnotice: () => undefined });
  let status: MigrationRunStatus;
  try {
    await pgSql`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
    try {
      const files = readMigrationFiles(dir);
      await pgSql.unsafe(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
           name TEXT PRIMARY KEY,
           checksum TEXT NOT NULL,
           applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`,
      );
      const tracker: MigrationTracker = {
        loadApplied: async () => {
          const rows = await pgSql<{ name: string; checksum: string }[]>`SELECT name, checksum FROM schema_migrations`;
          return new Map(rows.map((r) => [r.name, r.checksum]));
        },
        record: async (name, checksum) => {
          await pgSql`INSERT INTO schema_migrations (name, checksum) VALUES (${name}, ${checksum})
                      ON CONFLICT (name) DO NOTHING`;
        },
      };
      const { applied, failed, skipped } = await applyMigrations(
        files,
        (sql) => pgSql.unsafe(sql).then(() => undefined),
        tracker,
      );
      status = { ranAt: new Date().toISOString(), total: files.length, applied, skipped, failed, error: null };
    } finally {
      await pgSql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`.catch((err: unknown) => {
        logger.warn({ err }, '[Migrations] advisory unlock 실패 — 연결 종료로 해제됨');
      });
    }
  } catch (err) {
    status = {
      ranAt: new Date().toISOString(), total: 0, applied: 0, skipped: 0, failed: [],
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await pgSql.end();
  }
  lastStatus = status;
  return status;
}

// 서버 부팅 시 호출. 실패해도 throw 하지 않는다 — 기동 중단 여부는 index.ts 가 MIGRATIONS_STRICT 로 결정.
export async function runAutoMigrations(): Promise<MigrationRunStatus> {
  const status = await runMigrations();
  if (status.error) {
    logger.error({ error: status.error }, '[Migrations] 자동 마이그레이션 전체 실패');
  } else if (status.failed.length > 0) {
    logger.error(
      { total: status.total, applied: status.applied, skipped: status.skipped, failed: status.failed },
      '[Migrations] 일부 마이그레이션 실패 — 스키마가 코드와 다를 수 있음 (/api/health/deep 에 표시)',
    );
  } else {
    logger.info(
      { total: status.total, applied: status.applied, skipped: status.skipped },
      '[Migrations] 자동 마이그레이션 완료',
    );
  }
  return status;
}
