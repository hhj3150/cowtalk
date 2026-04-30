/**
 * 술탄팜 센서 데이터 30일치 백필 (시연 대비 일회성)
 *
 * 진단 결과: 21두는 NaN parse 실패로 누락, 5두는 4월 초중순 멈춤(NaN 의심).
 * connector의 NaN-safe 파싱 패치 후, 30일치 windowed fetch로 백필.
 *
 * 실행: cd packages/server && npx tsx scripts/backfill-sultan-sensor.ts
 */
import 'dotenv/config';
import postgres from 'postgres';
import { SmaxtecApiClient } from '../src/pipeline/connectors/smaxtec.connector.js';

const SULTAN_FARM_ID = '0eaf0418-3796-44ed-9882-a42a430ccf0c';
const DAYS_BACK = 30;
const WINDOW_DAYS = 7; // smaXtec API 안정 윈도우
const METRICS = ['temp', 'act', 'rum_index'] as const;

const METRIC_TYPE_MAP: Record<string, string> = {
  temp: 'temperature',
  act: 'activity',
  rum_index: 'rumination',
};

type Animal = { animal_id: string; ear_tag: string; external_id: string };

function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

async function backfillAnimal(
  sql: postgres.Sql,
  client: SmaxtecApiClient,
  animal: Animal,
): Promise<{ inserted: number; windows: number }> {
  if (!animal.external_id) return { inserted: 0, windows: 0 };

  const now = new Date();
  let totalInserted = 0;
  let windowsProcessed = 0;

  // 30일을 7일 윈도우로 분할 — smaXtec 응답 크기 안정화
  for (let offset = 0; offset < DAYS_BACK; offset += WINDOW_DAYS) {
    const toDate = new Date(now.getTime() - offset * 24 * 3600 * 1000);
    const fromDate = new Date(now.getTime() - Math.min(offset + WINDOW_DAYS, DAYS_BACK) * 24 * 3600 * 1000);

    for (const metric of METRICS) {
      try {
        const data = await client.fetchSensorData(
          animal.external_id,
          metric,
          fmtDate(fromDate),
          fmtDate(toDate),
        );
        const series = data.metrics?.[metric];
        if (!series || series.length === 0) continue;

        const values = series
          .filter(
            (d): d is { ts: number; value: number } =>
              d.value !== null && d.value !== undefined && Number.isFinite(d.value),
          )
          .map((d) => ({
            animalId: animal.animal_id,
            timestamp: new Date(d.ts * 1000),
            metricType: METRIC_TYPE_MAP[metric] ?? metric,
            value: metric === 'rum_index' ? Math.round(d.value / 60) : d.value,
            qualityFlag: 'good',
          }));

        if (values.length === 0) continue;

        // bulk insert with conflict skip — postgres.js style
        const result = await sql`
          INSERT INTO sensor_measurements (animal_id, timestamp, metric_type, value, quality_flag)
          SELECT * FROM ${sql(values, 'animalId', 'timestamp', 'metricType', 'value', 'qualityFlag')}
          ON CONFLICT DO NOTHING
        `;
        totalInserted += result.count;
      } catch (err) {
        console.warn(
          `  [warn] ${animal.ear_tag} ${metric} ${fmtDate(fromDate)}~${fmtDate(toDate)}: ${err instanceof Error ? err.message.slice(0, 100) : String(err)}`,
        );
      }
      windowsProcessed += 1;
      await new Promise((r) => setTimeout(r, 150)); // rate limit
    }
  }

  return { inserted: totalInserted, windows: windowsProcessed };
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const email = process.env.SMAXTEC_EMAIL;
  const password = process.env.SMAXTEC_PASSWORD;
  if (!dbUrl || !email || !password) throw new Error('env not set');

  const sql = postgres(dbUrl);
  const client = new SmaxtecApiClient(email, password);
  await client.authenticate();
  console.log('[backfill] smaXtec auth OK');

  // 백필 대상: 술탄팜 활성 개체 전체 (NaN-fix가 작동하므로 전수 시도, 빈 응답이면 자연 스킵)
  const animals = (await sql<Animal[]>`
    SELECT animal_id, ear_tag, external_id
    FROM animals
    WHERE farm_id = ${SULTAN_FARM_ID} AND status = 'active'
    ORDER BY ear_tag
  `);

  console.log(`[backfill] 대상 ${String(animals.length)}두, ${String(DAYS_BACK)}일치 시도\n`);

  let grandTotal = 0;
  for (const animal of animals) {
    const { inserted } = await backfillAnimal(sql, client, animal);
    grandTotal += inserted;
    console.log(`  ${animal.ear_tag.padEnd(5)} +${String(inserted).padStart(5)}건  (누적 ${String(grandTotal)})`);
  }

  console.log(`\n[backfill] 완료: 총 ${String(grandTotal)}건 신규 삽입`);

  // 사후 통계
  const after = await sql<Array<{ animals: number; total: number; min_ts: Date; max_ts: Date }>>`
    SELECT
      COUNT(DISTINCT sm.animal_id)::int AS animals,
      COUNT(*)::int AS total,
      MIN(sm.timestamp) AS min_ts,
      MAX(sm.timestamp) AS max_ts
    FROM sensor_measurements sm
    JOIN animals a ON a.animal_id = sm.animal_id
    WHERE a.farm_id = ${SULTAN_FARM_ID}
  `;
  const a = after[0];
  console.log(
    `[backfill] 술탄팜 누적: ${String(a.animals)}두 / ${String(a.total)}건 (${a.min_ts.toISOString().slice(0, 10)} ~ ${a.max_ts.toISOString().slice(0, 10)})`,
  );

  await sql.end();
}

main().catch((err) => {
  console.error('[backfill] FAIL', err);
  process.exit(1);
});
