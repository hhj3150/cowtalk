// Phase 5 통합 검증 — 농장 격리 전수 점검 (실제 DB)
//
// 모든 GET 라우트를 라우트 파일에서 직접 읽어(새 라우트도 자동 포함) 다른 농장의 ID 를 넣어 호출하고,
// 그 농장에만 있는 표지(농장명·관리번호)가 응답에 나오지 않는지 확인한다.
//   - 농장 A 에 배정된 농장주 / 배정 없는 농장주 두 계정으로 점검
//   - 상태코드는 기록만 한다(403·404·빈 결과 모두 허용). 판정 기준은 '남의 데이터가 보였는가'
//   - 5xx 는 실패로 보지 않되 목록을 남긴다 (로컬에 외부 API 키가 없어 생기는 오류가 있다)

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
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
const MARK_FARM = `격리B목장${RUN}`;
const MARK_TAG = `ISOB${RUN}`;

/** 호출하지 않는 경로 — 외부 서비스 호출·스트림·파일 다운로드라 격리 판정 대상이 아니다 */
const SKIP = [/^\/api\/debug/, /^\/api\/smaxtec-notes/, /^\/api\/audio/, /^\/api\/news/, /^\/api\/weather/, /^\/api\/health/, /\/stream$/, /download/];

interface RouteSpec { readonly path: string }

function discoverGetRoutes(): RouteSpec[] {
  const index = readFileSync(path.join(SRC, 'index.ts'), 'utf-8');
  const fileOf = new Map<string, string>();
  for (const m of index.matchAll(/import \{([^}]+)\} from '\.\/routes\/([\w.-]+)\.js'/g)) {
    for (const name of m[1]!.split(',').map((s) => s.trim()).filter(Boolean)) fileOf.set(name, m[2]!);
  }
  const routes: RouteSpec[] = [];
  for (const m of index.matchAll(/api\.use\('([^']+)',\s*(?:[\w.()]+,\s*)*(\w+)\)/g)) {
    const mount = m[1]!; const routerVar = m[2]!; const file = fileOf.get(routerVar);
    if (!file) continue;
    const src = readFileSync(path.join(SRC, 'routes', `${file}.ts`), 'utf-8');
    for (const r of src.matchAll(new RegExp(`${routerVar}\\.get\\(\\s*'([^']+)'`, 'g'))) {
      routes.push({ path: `/api${mount}${r[1] === '/' ? '' : r[1]!}` });
    }
  }
  return routes;
}

let regionId = ''; let farmA = ''; let farmB = ''; let animalB = ''; let alertB = ''; let eventB = '';
const FARMER_A = '7a000000-0000-4000-8000-0000000000a1';
const FARMER_NONE = '7a000000-0000-4000-8000-0000000000a2';
const ADMIN = '7a000000-0000-4000-8000-0000000000a3';
let tokenA = ''; let tokenNone = ''; let tokenAdmin = '';

/** 경로 파라미터를 농장 B 의 실제 ID 로 채운 후보 URL 들 — 일반 :id 는 개체·알림·이벤트·농장 ID 를 모두 시도 */
function fillVariants(p: string): string[] {
  const base = p
    .replace(/:farmId/g, farmB)
    .replace(/:animalId|:cowId/g, animalB)
    .replace(/:alertId/g, alertB)
    .replace(/:eventId/g, eventB)
    .replace(/:traceId|:traceNo/g, '002000000000');
  if (!/:[a-zA-Z]+/.test(base)) return [base];
  return [animalB, alertB, eventB, farmB].map((id) => base.replace(/:[a-zA-Z]+/g, id));
}

beforeAll(async () => {
  const db = getDb();
  const [region] = await db.insert(regions).values({ province: '테스트도', district: '격리군', code: `I${RUN}` }).returning();
  regionId = region!.regionId;
  const [a] = await db.insert(farms).values({ regionId, name: `격리A목장${RUN}`, address: '주소', lat: 37.1, lng: 127.1 }).returning();
  const [b] = await db.insert(farms).values({ regionId, name: MARK_FARM, address: '주소', lat: 37.2, lng: 127.2, currentHeadCount: 1 }).returning();
  farmA = a!.farmId; farmB = b!.farmId;
  const [cow] = await db.insert(animals).values({ farmId: farmB, earTag: MARK_TAG, name: MARK_TAG, status: 'active' }).returning();
  animalB = cow!.animalId;
  const [ev] = await db.insert(smaxtecEvents).values({ animalId: animalB, farmId: farmB, eventType: 'temperature_warning', severity: 'high', detectedAt: new Date(), details: { note: MARK_TAG } }).returning();
  eventB = ev!.eventId;
  const [al] = await db.insert(alerts).values({
    alertType: 'health_risk', animalId: animalB, farmId: farmB, priority: 'high', title: `${MARK_TAG} 고열`,
    explanation: MARK_TAG, recommendedAction: '확인', dedupKey: `iso-${RUN}`,
  }).returning();
  alertB = al!.alertId;
  await db.insert(users).values([
    { userId: FARMER_A, name: '격리A농장주', email: `iso-a-${RUN}@test.local`, passwordHash: 'x', role: 'farmer', approvalStatus: 'approved' },
    { userId: FARMER_NONE, name: '미배정농장주', email: `iso-n-${RUN}@test.local`, passwordHash: 'x', role: 'farmer', approvalStatus: 'approved' },
    { userId: ADMIN, name: '전국행정관', email: `iso-g-${RUN}@test.local`, passwordHash: 'x', role: 'government_admin', approvalStatus: 'approved' },
  ] as never);
  await db.insert(userFarmAccess).values({ userId: FARMER_A, farmId: farmA } as never);
  invalidateApprovalCache();
  tokenA = signAccessToken({ userId: FARMER_A, role: 'farmer', farmIds: [farmA] } as never);
  tokenNone = signAccessToken({ userId: FARMER_NONE, role: 'farmer', farmIds: [] } as never);
  tokenAdmin = signAccessToken({ userId: ADMIN, role: 'government_admin', farmIds: [] } as never);
}, 60_000);

afterAll(async () => {
  const db = getDb();
  await db.delete(alerts).where(eq(alerts.farmId, farmB));
  await db.delete(smaxtecEvents).where(eq(smaxtecEvents.farmId, farmB));
  await db.delete(userFarmAccess).where(inArray(userFarmAccess.userId, [FARMER_A, FARMER_NONE, ADMIN]));
  await db.delete(users).where(inArray(users.userId, [FARMER_A, FARMER_NONE, ADMIN])).catch(() => undefined);
  await db.delete(animals).where(eq(animals.farmId, farmB)).catch(() => undefined);
  await db.delete(farms).where(inArray(farms.farmId, [farmA, farmB])).catch(() => undefined);
  await db.delete(regions).where(eq(regions.regionId, regionId)).catch(() => undefined);
  await closeDb();
});

describe('농장 격리 전수 점검', () => {
  const routes = discoverGetRoutes().filter((r) => !SKIP.some((re) => re.test(r.path)));

  it('GET 라우트를 충분히 찾았다 (라우트 표 파싱 회귀 방지)', () => {
    expect(routes.length).toBeGreaterThan(150);
  });

  async function sweep(token: string): Promise<{ seen: string[]; serverErrors: string[]; statuses: Record<string, number> }> {
    const app = createApp();
    const seen: string[] = [];
    const serverErrors: string[] = [];
    const statuses: Record<string, number> = {};
    for (const r of routes) {
      for (const filled of fillVariants(r.path)) {
        const url = `${filled}?farmId=${farmB}&farmIds=${farmB}&animalId=${animalB}`;
        let res: request.Response;
        try {
          res = await request(app).get(url).set('Authorization', `Bearer ${token}`).timeout(8_000);
        } catch {
          statuses.timeout = (statuses.timeout ?? 0) + 1;
          continue; // 타임아웃 — 판정 불가 (외부 호출)
        }
        statuses[String(res.status)] = (statuses[String(res.status)] ?? 0) + 1;
        if (res.status >= 500) serverErrors.push(`${res.status} ${filled}`);
        const body = res.text ?? '';
        if (body.includes(MARK_FARM) || body.includes(MARK_TAG)) seen.push(`${res.status} ${filled}`);
      }
    }
    return { seen, serverErrors, statuses };
  }

  it('대조군: 전국 행정관에게는 농장 B 표지가 보인다 (점검이 눈을 감고 있지 않음을 증명)', async () => {
    const { seen, statuses, serverErrors } = await sweep(tokenAdmin);
    console.info('[isolation] 행정관 상태 분포', JSON.stringify(statuses));
    if (serverErrors.length > 0) console.info(`[isolation] 행정관 5xx:\n${serverErrors.join('\n')}`);
    expect(seen.length).toBeGreaterThan(5);
  }, 600_000);

  for (const [who, token] of [['농장 A 농장주', () => tokenA], ['미배정 농장주', () => tokenNone]] as const) {
    it(`${who}: 다른 농장(B)의 표지가 어떤 응답에도 나오지 않는다`, async () => {
      const { seen, serverErrors, statuses } = await sweep(token());
      console.info(`[isolation] ${who} 상태 분포`, JSON.stringify(statuses));
      if (serverErrors.length > 0) console.info(`[isolation] ${who} 5xx ${String(serverErrors.length)}건:\n${serverErrors.join('\n')}`);
      expect(seen).toEqual([]);
    }, 600_000);
  }
});
