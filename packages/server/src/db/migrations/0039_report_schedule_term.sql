-- 정기 보고서: 연간 주기 추가 + 구독 기간(종료일)
--
-- 배경: 목장주가 "향후 1년 동안" 보고서를 받겠다고 했다. 그러려면 두 가지가 필요하다.
--   1) 1년을 마무리하는 연간 보고서 (annual) — 12개월 종합
--   2) 구독에 끝이 있다는 개념 (ends_at) — 끝나면 조용히 계속 보내지 않고 멈춘다
--
-- 기간이 끝난 구독은 행을 지우거나 enabled 를 몰래 끄지 않는다.
-- 화면에서 "기간 종료"로 보이고, 사용자가 연장하거나 해지한다 (자동 상태 변경 금지).

ALTER TABLE report_schedules
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;

-- kind 체크 제약에 annual 추가 (제약은 이름으로 교체 — IF NOT EXISTS 가 없으므로 DROP 후 재생성)
ALTER TABLE report_schedules DROP CONSTRAINT IF EXISTS report_schedules_kind_chk;
ALTER TABLE report_schedules
  ADD CONSTRAINT report_schedules_kind_chk
  CHECK (kind IN ('weekly', 'monthly', 'quarterly', 'performance', 'annual'));

-- ──────────────────────────────────────────────────────────────────────
-- 시드: 술탄목장 연간 보고서 구독 추가 + 기존 구독 4종에 1년 기간 부여
-- 멱등 — 이미 있으면 넣지 않고, ends_at 이 이미 정해진 구독은 건드리지 않는다.
-- ──────────────────────────────────────────────────────────────────────
INSERT INTO report_schedules (farm_id, kind, recipients, format, send_hour_kst, enabled)
SELECT f.farm_id, 'annual', '["hhj3150@hanmail.net"]'::jsonb, 'xlsx', 7, TRUE
FROM farms f
WHERE (f.name ILIKE '%술탄%' OR f.name ILIKE '%sultan%')
  AND f.deleted_at IS NULL
ON CONFLICT (farm_id, kind) DO NOTHING;

UPDATE report_schedules rs
SET ends_at = (
      -- KST 벽시계로 1년 뒤 그 날 23:59 → 다시 timestamptz 로 (서버 TimeZone 설정에 좌우되지 않게)
      date_trunc('day', (now() AT TIME ZONE 'Asia/Seoul'))
        + INTERVAL '1 year' + INTERVAL '23 hours 59 minutes'
    ) AT TIME ZONE 'Asia/Seoul',
    updated_at = now()
FROM farms f
WHERE rs.farm_id = f.farm_id
  AND (f.name ILIKE '%술탄%' OR f.name ILIKE '%sultan%')
  AND rs.ends_at IS NULL;
