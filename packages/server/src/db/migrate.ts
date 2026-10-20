// 마이그레이션 실행기 (CLI: npm run migrate)
//
// OPS-13: 부팅 자동 마이그레이션과 같은 경로(runMigrations — 적용 이력·advisory lock·파일별 격리)를 쓴다.
// 예전 CLI 는 적용 이력 없이 모든 파일을 매번 다시 실행했다(데이터 변경 재적용 위험 — SEC-03).
// 배포 전 별도 단계로 쓸 수 있게 실패가 하나라도 있으면 종료 코드 1.

import postgres from 'postgres';
import { getDatabaseUrl } from '../config/index.js';
import { runMigrations, migrationsFailed } from './auto-migrate.js';

async function ensureExtensions(): Promise<void> {
  const sql = postgres(getDatabaseUrl(), { max: 1, onnotice: () => undefined });
  try {
    await sql.unsafe('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    console.info('  ✓ uuid-ossp extension enabled');
    // TimescaleDB — 없으면 건너뜀 (Homebrew PG에는 없을 수 있음). hypertable 구문은 sanitizeMigration 이 제거
    try {
      await sql.unsafe('CREATE EXTENSION IF NOT EXISTS "timescaledb";');
      console.info('  ✓ TimescaleDB extension enabled');
    } catch {
      console.warn('  ⚠ TimescaleDB not available — skipping hypertable creation');
    }
  } finally {
    await sql.end();
  }
}

async function migrate(): Promise<void> {
  console.info('Running migrations...');
  await ensureExtensions();
  const status = await runMigrations();
  console.info(`  total ${String(status.total)} · applied ${String(status.applied)} · skipped ${String(status.skipped)}`);
  if (migrationsFailed(status)) {
    console.error('Migration failed:', status.error ?? status.failed.join(', '));
    process.exit(1);
  }
  console.info('Migrations completed successfully.');
}

migrate().catch((error: unknown) => {
  console.error('Migration process failed:', error);
  process.exit(1);
});
