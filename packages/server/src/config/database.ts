// PostgreSQL 연결 (Drizzle ORM + postgres.js)

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config, getDatabaseUrl } from './index.js';
import * as schema from '../db/schema.js';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sql: ReturnType<typeof postgres> | null = null;

/**
 * OPS-09: 연결 옵션. statement_timeout 이 없으면 느린 쿼리 몇 개가 풀(20)을 다 잡아
 * 모든 API 가 줄줄이 멈춘다 (대시보드는 위젯 12개를 동시에 조회).
 */
export function poolOptions(statementTimeoutMs: number): postgres.Options<Record<string, postgres.PostgresType>> {
  return {
    max: 20,
    idle_timeout: 20,
    connect_timeout: 10,
    ...(statementTimeoutMs > 0 ? { connection: { statement_timeout: statementTimeoutMs } } : {}),
  };
}

export function getDb() {
  if (!db) {
    sql = postgres(getDatabaseUrl(), poolOptions(config.DB_STATEMENT_TIMEOUT_MS));
    db = drizzle(sql, { schema });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
    db = null;
  }
}
