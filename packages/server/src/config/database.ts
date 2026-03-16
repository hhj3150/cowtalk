// PostgreSQL 연결 (Drizzle ORM + postgres.js)

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getDatabaseUrl } from './index';
import * as schema from '../db/schema';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!db) {
    sql = postgres(getDatabaseUrl(), {
      max: 20,
      idle_timeout: 20,
      connect_timeout: 10,
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
