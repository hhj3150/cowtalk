// 마이그레이션 실행기

import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabaseUrl } from '../config/index';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate(): Promise<void> {
  const sql = postgres(getDatabaseUrl());

  try {
    console.info('Running migrations...');

    const migrationPath = resolve(__dirname, 'migrations', '0001_initial.sql');
    const migration = readFileSync(migrationPath, 'utf-8');

    await sql.unsafe(migration);

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
