/**
 * 술탄팜 센서 데이터 누락 진단 (시연 대비 일회성)
 *
 * 50두 중 9두 sm_count=0, 6두는 4월 7~20일 이후 멈춤.
 * 각 개체에 대해 smaXtec API 직접 호출 → 응답 종류로 원인 분류.
 *
 * 실행: cd packages/server && pnpm tsx scripts/diagnose-sultan-sensor-gap.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const SULTAN_FARM_ID = '0eaf0418-3796-44ed-9882-a42a430ccf0c';
const API_BASE = 'https://api.smaxtec.com/api/v2';
const INTEG_BASE = 'https://api.smaxtec.com/integration/v2';

type AnimalRow = {
  ear_tag: string;
  external_id: string;
  current_device_id: string | null;
  last_sm: Date | null;
  sm_count: number;
};

type Diagnosis =
  | { kind: 'ok'; samples: number }
  | { kind: 'empty'; httpStatus: number }
  | { kind: 'http_error'; httpStatus: number; body: string }
  | { kind: 'no_metric'; metricsReturned: string[] }
  | { kind: 'thrown'; message: string };

async function authenticate(): Promise<string> {
  const email = process.env.SMAXTEC_EMAIL;
  const password = process.env.SMAXTEC_PASSWORD;
  if (!email || !password) throw new Error('SMAXTEC_EMAIL/PASSWORD not set');

  const res = await fetch(`${INTEG_BASE}/users/session_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: email, password }),
  });
  if (!res.ok) {
    throw new Error(`auth failed: ${String(res.status)} ${await res.text()}`);
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

async function probeAnimal(token: string, externalId: string): Promise<Diagnosis> {
  // 어제~내일 범위 (실제 파이프라인과 동일)
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  const fmt = (d: Date) => d.toISOString().split('T')[0];

  const params = new URLSearchParams();
  for (const m of ['temp', 'act', 'rum_index']) params.append('metrics', m);
  params.append('from_date', fmt(yesterday));
  params.append('to_date', fmt(tomorrow));

  const url = `${API_BASE}/data/animals/${externalId}.json?${params.toString()}`;

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.text();
      return { kind: 'http_error', httpStatus: res.status, body: body.slice(0, 200) };
    }
    const raw = (await res.json()) as Array<{ metric: string; data: unknown[] }>;
    if (!Array.isArray(raw) || raw.length === 0) {
      return { kind: 'empty', httpStatus: res.status };
    }
    const totalSamples = raw.reduce((acc, m) => acc + (Array.isArray(m.data) ? m.data.length : 0), 0);
    if (totalSamples === 0) {
      return { kind: 'no_metric', metricsReturned: raw.map((m) => m.metric) };
    }
    return { kind: 'ok', samples: totalSamples };
  } catch (err) {
    return { kind: 'thrown', message: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  const sql = postgres(dbUrl);

  const rows = (await sql<AnimalRow[]>`
    SELECT a.ear_tag, a.external_id, a.current_device_id,
           (SELECT MAX(timestamp) FROM sensor_measurements WHERE animal_id = a.animal_id) AS last_sm,
           (SELECT COUNT(*) FROM sensor_measurements WHERE animal_id = a.animal_id)::int AS sm_count
    FROM animals a
    WHERE a.farm_id = ${SULTAN_FARM_ID} AND a.status = 'active'
    ORDER BY sm_count NULLS FIRST, a.ear_tag
  `);

  console.log(`[diagnose] 술탄팜 활성개체 ${String(rows.length)}두 점검 시작`);

  const token = await authenticate();
  console.log('[diagnose] smaXtec 인증 완료');

  const results: Array<{ row: AnimalRow; diag: Diagnosis }> = [];
  for (const row of rows) {
    if (!row.external_id) {
      results.push({ row, diag: { kind: 'thrown', message: 'no external_id' } });
      continue;
    }
    const diag = await probeAnimal(token, row.external_id);
    results.push({ row, diag });
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 200)); // 부하 완화
  }
  console.log('');

  // 분류 집계
  const buckets: Record<string, Array<{ tag: string; ext: string; last: Date | null; smCount: number; detail: string }>> = {
    ok: [],
    empty: [],
    http_404: [],
    http_other: [],
    no_metric: [],
    thrown: [],
  };
  for (const { row, diag } of results) {
    const detail =
      diag.kind === 'http_error'
        ? `${String(diag.httpStatus)} ${diag.body}`
        : diag.kind === 'no_metric'
          ? `metrics=${diag.metricsReturned.join(',')}`
          : diag.kind === 'thrown'
            ? diag.message
            : diag.kind === 'ok'
              ? `samples=${String(diag.samples)}`
              : '';
    const item = { tag: row.ear_tag, ext: row.external_id, last: row.last_sm, smCount: row.sm_count, detail };
    if (diag.kind === 'ok') buckets.ok.push(item);
    else if (diag.kind === 'empty') buckets.empty.push(item);
    else if (diag.kind === 'http_error' && diag.httpStatus === 404) buckets.http_404.push(item);
    else if (diag.kind === 'http_error') buckets.http_other.push(item);
    else if (diag.kind === 'no_metric') buckets.no_metric.push(item);
    else buckets.thrown.push(item);
  }

  console.log('\n=== 진단 결과 요약 ===');
  for (const [bucket, items] of Object.entries(buckets)) {
    console.log(`\n[${bucket}] ${String(items.length)}두`);
    for (const item of items) {
      const lastStr = item.last ? item.last.toISOString().slice(0, 10) : 'never';
      console.log(`  ${item.tag.padEnd(5)} sm=${String(item.smCount).padStart(5)} last=${lastStr} ${item.detail}`);
    }
  }

  await sql.end();
}

main().catch((err) => {
  console.error('[diagnose] FAIL', err);
  process.exit(1);
});
