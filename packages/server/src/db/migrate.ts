// 마이그레이션 실행기 — 여러 SQL 파일 순차 실행

import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabaseUrl } from '../config/index';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate(): Promise<void> {
  const sql = postgres(getDatabaseUrl());

  try {
    console.info('Running migrations...');

    // uuid-ossp 확장 먼저 활성화
    await sql.unsafe('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    console.info('  ✓ uuid-ossp extension enabled');

    // TimescaleDB — 없으면 건너뜀 (Homebrew PG에는 없을 수 있음)
    try {
      await sql.unsafe('CREATE EXTENSION IF NOT EXISTS "timescaledb";');
      console.info('  ✓ TimescaleDB extension enabled');
    } catch {
      console.warn('  ⚠ TimescaleDB not available — skipping hypertable creation');
    }

    // 마이그레이션 파일 순차 실행
    const migrationsDir = resolve(__dirname, 'migrations');
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const filePath = resolve(migrationsDir, file);
      let migration = readFileSync(filePath, 'utf-8');

      // TimescaleDB가 없으면 hypertable/extension 구문 제거
      migration = migration
        .replace(/CREATE EXTENSION IF NOT EXISTS "timescaledb";/g, '-- TimescaleDB skipped')
        .replace(/SELECT create_hypertable\([^)]+\);/g, '-- hypertable skipped (TimescaleDB not available)');

      await sql.unsafe(migration);
      console.info(`  ✓ ${file}`);
    }

    console.info('Migrations completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

migrate().catch((error) => {
  console.error('Migration process failed:', error);
  process.exit(1);
});
