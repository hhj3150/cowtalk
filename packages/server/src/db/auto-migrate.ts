// 부팅 시 자동 마이그레이션 — 파일별 격리 실행
//
// 왜 분리/격리가 필요한가:
//   index.ts 의 기존 ensureMigrations 는 for-loop 전체를 하나의 try/catch 로 감쌌다.
//   그래서 비멱등 마이그레이션 한 개(예: 0015 의 CREATE INDEX without IF NOT EXISTS)가
//   재실행 시 "relation already exists" 로 throw 하면, 그 뒤 모든 파일(0019~0021…)이
//   매 부팅마다 영구히 스킵됐다(프로덕션에서 0019~0021 누락의 진짜 원인).
//
//   → 파일별 try/catch 로 바꿔, 한 파일이 실패해도 이후 파일은 계속 적용한다.

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
export async function applyMigrations(
  files: readonly MigrationFile[],
  run: (sql: string) => Promise<void>,
): Promise<MigrationSummary> {
  const failed: string[] = [];
  let applied = 0;

  for (const file of files) {
    try {
      await run(sanitizeMigration(file.sql));
      applied += 1;
    } catch (err) {
      failed.push(file.name);
      logger.warn({ err, file: file.name }, '[Migrations] 파일 적용 실패 — 건너뛰고 다음 파일 계속');
    }
  }

  return { applied, failed };
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function readMigrationFiles(dir: string): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(resolve(dir, name), 'utf-8') }));
}

// 서버 부팅 시 호출 — DB 연결을 열어 dist/db/migrations 전체를 파일별로 적용.
// 비치명: 실패해도 throw 하지 않는다(개별 파일 실패는 warn 로그). 서버는 계속 기동.
export async function runAutoMigrations(): Promise<void> {
  const dir = resolve(__dirname, 'migrations');
  const pgSql = postgres(getDatabaseUrl());
  try {
    const files = readMigrationFiles(dir);
    const { applied, failed } = await applyMigrations(files, (sql) =>
      pgSql.unsafe(sql).then(() => undefined),
    );
    logger.info(
      { total: files.length, applied, failedCount: failed.length, failed },
      '[Migrations] 자동 마이그레이션 완료',
    );
  } catch (err) {
    // 디렉터리 읽기/연결 실패 등 전체 단위 오류만 여기로 — 비치명 처리.
    logger.error({ err }, '[Migrations] 자동 마이그레이션 전체 실패 — 서버는 계속 기동');
  } finally {
    await pgSql.end();
  }
}
