// smaxtec_events.detected_at 타임존 보정 — 일회성 스크립트 (운영 데이터 변경은 하원장님 승인 후 --apply)
//
// 원인: smaXtec event_ts 가 타임존 없는 KST 벽시계 문자열("2026-10-29T10:51:41")로 오는데
//       예전 정규화가 new Date() 로 읽어 서버(UTC) 기준으로 저장 → 실제보다 +9시간.
//       수정 코드: pipeline/smaxtec-time.ts (parseSmaxtecTimestamp)
//
// 보정 대상 = "버그가 만든 값"과 정확히 일치하는 행만:
//   raw_data.event_ts(또는 timestamp)가 타임존 없는 ISO 형태 AND
//   detected_at = (event_ts 를 UTC 로 읽은 값)
//   → detected_at := event_ts 를 Asia/Seoul 로 읽은 값
// 보정 후엔 서명이 더 이상 일치하지 않으므로 재실행해도 안전(멱등). 다른 경로로 들어간 행은 건드리지 않는다.
//
// 사용:
//   npx tsx packages/server/src/scripts/fix-smaxtec-event-timezone.ts            # 진단만 (읽기 전용, 기본값)
//   npx tsx packages/server/src/scripts/fix-smaxtec-event-timezone.ts --apply    # 보정 실행
//   --force : 진단상 KST 가설 근거가 약해도 실행 (권장하지 않음)

import postgres from 'postgres';
import { getDatabaseUrl } from '../config/index.js';

const NAIVE_ISO_REGEX = String.raw`^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?)?$`;
const BATCH = 20_000;

const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');

async function main(): Promise<void> {
  const sql = postgres(getDatabaseUrl(), { max: 1 });
  try {
    // 1) 진단 — 원본 시각 형식 분포 + 미래 시각 + "CowTalk 저장 시각보다 늦은 감지 시각"(물리적으로 불가능 → 오파싱 근거)
    const [diag] = await sql<Array<Record<string, string | null>>>`
      WITH src AS (
        SELECT detected_at, created_at, coalesce(raw_data->>'event_ts', raw_data->>'timestamp') AS ts
        FROM smaxtec_events
      )
      SELECT
        count(*)                                                                  AS total,
        count(*) FILTER (WHERE ts IS NULL)                                        AS no_ts,
        count(*) FILTER (WHERE ts ~ ${NAIVE_ISO_REGEX})                           AS naive_ts,
        count(*) FILTER (WHERE ts IS NOT NULL AND ts !~ ${NAIVE_ISO_REGEX})       AS tz_ts,
        count(*) FILTER (WHERE detected_at > now() + interval '10 minutes')       AS future_rows,
        count(*) FILTER (WHERE ts ~ ${NAIVE_ISO_REGEX}
                           AND created_at >= now() - interval '7 days')           AS naive_recent,
        count(*) FILTER (WHERE ts ~ ${NAIVE_ISO_REGEX}
                           AND created_at >= now() - interval '7 days'
                           AND detected_at > created_at + interval '10 minutes')  AS naive_recent_after_insert,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY extract(epoch FROM created_at - detected_at) / 3600.0
        ) FILTER (WHERE ts ~ ${NAIVE_ISO_REGEX} AND created_at >= now() - interval '7 days')
                                                                                  AS naive_recent_median_ingest_lag_h
      FROM src
    `;
    console.info('── 진단 ──');
    console.info(JSON.stringify(diag, null, 2));

    const samples = await sql`
      SELECT event_id, event_type, raw_data->>'event_ts' AS event_ts, raw_data->>'create_ts' AS create_ts,
             detected_at, created_at
      FROM smaxtec_events
      ORDER BY detected_at DESC
      LIMIT 5
    `;
    console.info('── 최신 detected_at 5건 (원본 문자열 비교) ──');
    console.info(JSON.stringify(samples, null, 2));

    const [cand] = await sql<Array<{ candidates: string }>>`
      SELECT count(*) AS candidates
      FROM smaxtec_events
      WHERE coalesce(raw_data->>'event_ts', raw_data->>'timestamp') ~ ${NAIVE_ISO_REGEX}
        AND detected_at = (coalesce(raw_data->>'event_ts', raw_data->>'timestamp'))::timestamp AT TIME ZONE 'UTC'
    `;
    const candidates = Number(cand?.candidates ?? 0);
    console.info(`보정 대상 (UTC 오파싱 서명 일치): ${String(candidates)}건 → 각 -9시간`);

    if (!apply) {
      console.info('dry-run — 변경 없음. 실행하려면 --apply');
      return;
    }
    if (candidates === 0) {
      console.info('보정할 행 없음 (이미 보정됐거나 해당 없음)');
      return;
    }

    // 2) 안전장치 — 최근 7일 naive 행의 과반이 "저장 시각보다 늦게 감지"여야 KST 가설이 데이터로 뒷받침된다
    const recent = Number(diag?.naive_recent ?? 0);
    const afterInsert = Number(diag?.naive_recent_after_insert ?? 0);
    if (!force && (recent === 0 || afterInsert / recent < 0.5)) {
      console.error(`중단: KST 가설 근거 부족 (최근 7일 naive ${String(recent)}건 중 저장 후 감지 ${String(afterInsert)}건). 원본을 확인하거나 --force`);
      process.exitCode = 1;
      return;
    }

    // 3) 배치 보정 — 행 잠금을 짧게 유지
    let total = 0;
    for (;;) {
      const rows = await sql`
        UPDATE smaxtec_events e
        SET detected_at = (coalesce(e.raw_data->>'event_ts', e.raw_data->>'timestamp'))::timestamp AT TIME ZONE 'Asia/Seoul'
        WHERE e.event_id IN (
          SELECT event_id FROM smaxtec_events
          WHERE coalesce(raw_data->>'event_ts', raw_data->>'timestamp') ~ ${NAIVE_ISO_REGEX}
            AND detected_at = (coalesce(raw_data->>'event_ts', raw_data->>'timestamp'))::timestamp AT TIME ZONE 'UTC'
          LIMIT ${BATCH}
        )
        RETURNING 1
      `;
      total += rows.length;
      console.info(`  보정 ${String(total)} / ${String(candidates)}`);
      if (rows.length < BATCH) break;
    }

    const [after] = await sql<Array<{ future_rows: string }>>`
      SELECT count(*) AS future_rows FROM smaxtec_events WHERE detected_at > now() + interval '10 minutes'
    `;
    console.info(`완료: ${String(total)}건 보정 · 남은 미래 시각 행 ${String(after?.future_rows ?? 0)}건`);
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error('[fix-smaxtec-event-timezone] 실패', err);
  process.exitCode = 1;
});
