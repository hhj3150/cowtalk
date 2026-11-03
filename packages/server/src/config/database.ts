// PostgreSQL 연결 (Drizzle ORM + postgres.js)

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getDatabaseUrl } from './index.js';
import * as schema from '../db/schema.js';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!db) {
    sql = postgres(getDatabaseUrl(), {
      max: 20,
      // 20초였을 때: 잠깐만 한가해도 연결이 전부 닫혀, 목장 진입처럼 요청 십수 개가 몰리는
      // 순간 새 연결을 한꺼번에 열어야 했다. 연결 수립이 connect_timeout 을 넘기면 500 →
      // "처음엔 오류, 다시 누르면 됨"(두 번째엔 연결이 살아 있음). 연결을 5분간 유지한다.
      idle_timeout: 300,
      // 동시 연결 수립이 몰려도 첫 요청이 오류로 끝나지 않게 여유를 둔다
      connect_timeout: 30,
    });
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
