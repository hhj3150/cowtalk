// Phase 5 통합 검증 — 쓰기 경로 격리 점검 (실제 DB, 테스트 데이터만)
// 농장 A 농장주가 농장 B 의 ID 로 POST/PUT/PATCH/DELETE 를 보냈을 때 2xx 가 나는 경로를 모은다.
// 2xx 자체가 곧 누수는 아니므로(본문의 farmId 를 무시하고 자기 농장으로 처리하는 경우 등) 두 가지를 판정한다:
//   1) 농장 B 의 데이터(개체·알림)가 바뀌거나 지워졌는가 → 실패
//   2) 2xx 목록은 기록으로 남긴다
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import { createApp } from '@server/app';
import { getDb, closeDb } from '@server/config/database.js';
import { regions, farms, animals, smaxtecEvents, alerts, users, userFarmAccess } from '@server/db/schema.js';
import { signAccessToken } from '@server/lib/auth.js';
import { invalidateApprovalCache } from '@server/services/auth/approval.service.js';

const SRC = path.resolve(__dirname, '../../packages/server/src/api');
const RUN = String(Date.now()).slice(-7);
const SKIP = [/^\/api\/debug/, /^\/api\/smaxtec-notes/, /^\/api\/audio/, /^\/api\/auth/, /\/stream$/, /^\/api\/payments/, /^\/api\/report-generate/, /^\/api\/chat/, /^\/api\/label-chat/, /^\/api\/ear-tag-scan/, /^\/api\/notifications\/(alimtalk|test|push-test)/];

function discover(): Array<{ method: string; path: string }> {
  const index = readFileSync(path.join(SRC, 'index.ts'), 'utf-8');
  const fileOf = new Map<string, string>();
  for (const m of index.matchAll(/import \{([^}]+)\} from '\.\/routes\/([\w.-]+)\.js'/g)) {
    for (const name of m[1]!.split(',').map((s) => s.trim()).filter(Boolean)) fileOf.set(name, m[2]!);
  }
  const out: Array<{ method: string; path: string }> = [];
  for (const m of index.matchAll(/api\.use\('([^']+)',\s*(?:[\w.()]+,\s*)*(\w+)\)/g)) {
    const file = fileOf.get(m[2]!); if (!file) continue;
    const src = readFileSync(path.join(SRC, 'routes', `${file}.ts`), 'utf-8');
    for (const r of src.matchAll(new RegExp(`${m[2]!}\\.(post|put|patch|delete)\\(\\s*'([^']+)'`, 'g'))) {
      out.push({ method: r[1]!, path: `/api${m[1]!}${r[2] === '/' ? '' : r[2]!}` });
    }
  }
  return out;
}

let regionId = ''; let farmA = ''; let farmB = ''; let animalB = ''; let alertB = ''; let eventB = '';
const FARMER_A = randomUUID();
let tokenA = '';

beforeAll(async () => {
  const db = getDb();
  const [region] = await db.insert(regions).values({ province: '테스트도', district: '쓰기군', code: `W${RUN}` }).returning();
  regionId = region!.regionId;
  const [a] = await db.insert(farms).values({ regionId, name: `쓰기A${RUN}`, address: '주소', lat: 37.1, lng: 127.1 }).returning();
  const [b] = await db.insert(farms).values({ regionId, name: `쓰기B${RUN}`, address: '주소', lat: 37.2, lng: 127.2 }).returning();
  farmA = a!.farmId; farmB = b!.farmId;
  const [cow] = await db.insert(animals).values({ farmId: farmB, earTag: `WB${RUN}`, status: 'active' }).returning();
  animalB = cow!.animalId;
  const [ev] = await db.insert(smaxtecEvents).values({ animalId: animalB, farmId: farmB, eventType: 'temperature_warning', severity: 'high', detectedAt: new Date() }).returning();
  eventB = ev!.eventId;
  const [al] = await db.insert(alerts).values({ alertType: 'health_risk', animalId: animalB, farmId: farmB, priority: 'high', title: 't', explanation: 'e', recommendedAction: 'r', dedupKey: `w-${RUN}` }).returning();
  alertB = al!.alertId;
  await db.insert(users).values({ userId: FARMER_A, name: '쓰기A', email: `w-a-${RUN}@test.local`, passwordHash: 'x', role: 'farmer', approvalStatus: 'approved' } as never);
  await db.insert(userFarmAccess).values({ userId: FARMER_A, farmId: farmA } as never);
  invalidateApprovalCache();
  tokenA = signAccessToken({ userId: FARMER_A, role: 'farmer', farmIds: [farmA] } as never);
}, 60_000);

afterAll(async () => {
  const db = getDb();
  await db.delete(userFarmAccess).where(eq(userFarmAccess.userId, FARMER_A)).catch(() => undefined);
  await db.delete(alerts).where(eq(alerts.farmId, farmB)).catch(() => undefined);
  await db.delete(smaxtecEvents).where(eq(smaxtecEvents.farmId, farmB)).catch(() => undefined);
  await db.delete(users).where(eq(users.userId, FARMER_A)).catch(() => undefined);
  await db.delete(animals).where(eq(animals.farmId, farmB)).catch(() => undefined);
  await db.delete(farms).where(inArray(farms.farmId, [farmA, farmB])).catch(() => undefined);
  await db.delete(regions).where(eq(regions.regionId, regionId)).catch(() => undefined);
  await closeDb();
});

describe('쓰기 경로 격리', () => {
  it('농장 B 의 개체·알림·이벤트가 농장 A 농장주의 쓰기 요청으로 바뀌지 않는다', async () => {
    const app = createApp();
    const routes = discover().filter((r) => !SKIP.some((re) => re.test(r.path)));
    expect(routes.length).toBeGreaterThan(60);
    const ok2xx: string[] = [];
    const body = { farmId: farmB, animalId: animalB, alertId: alertB, eventId: eventB, farmIds: [farmB], status: 'acknowledged', notes: 'probe', earTag: `X${RUN}`, name: `X${RUN}` };
    for (const r of routes) {
      const ids = /:[a-zA-Z]+/.test(r.path) ? [animalB, alertB, eventB, farmB] : [''];
      for (const id of ids) {
        const url = r.path.replace(/:farmId/g, farmB).replace(/:animalId/g, animalB).replace(/:[a-zA-Z]+/g, id);
        let res: request.Response;
        try {
          res = await (request(app) as unknown as Record<string, (u: string) => request.Test>)[r.method]!(url)
            .set('Authorization', `Bearer ${tokenA}`).send(body).timeout(8_000);
        } catch { continue; }
        if (res.status >= 200 && res.status < 300) ok2xx.push(`${r.method.toUpperCase()} ${url.replace(farmB, ':farmB').replace(animalB, ':animalB').replace(alertB, ':alertB').replace(eventB, ':eventB')}`);
      }
    }
    console.info(`[write-probe] 2xx ${String(ok2xx.length)}건:\n${ok2xx.join('\n')}`);
    // 본인 데이터만 다루는 경로만 2xx 허용 (알림 설정·클라이언트 오류 로그)
    const ALLOWED = new Set(['POST /api/notifications/preferences', 'POST /api/errors/log', 'POST /api/errors/batch']);
    expect(ok2xx.filter((x) => !ALLOWED.has(x))).toEqual([]);

    const db = getDb();
    const [cow] = await db.select().from(animals).where(eq(animals.animalId, animalB));
    const [al] = await db.select().from(alerts).where(eq(alerts.alertId, alertB));
    const [ev] = await db.select().from(smaxtecEvents).where(eq(smaxtecEvents.eventId, eventB));
    expect(cow, '개체 삭제됨').toBeDefined();
    expect(cow!.farmId).toBe(farmB);
    expect(cow!.earTag).toBe(`WB${RUN}`);
    expect(cow!.status).toBe('active');
    expect(al, '알림 삭제됨').toBeDefined();
    expect(al!.status).toBe('new');
    expect(ev, '이벤트 삭제됨').toBeDefined();
    expect(ev!.acknowledged ?? false).toBe(false);
  }, 900_000);
});
