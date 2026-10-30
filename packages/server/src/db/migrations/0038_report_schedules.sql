-- 정기 보고서 구독 (report_schedules) + 발송 원장 (report_deliveries)
--
-- 왜 DB인가:
--   1) 수신자·주기를 바꾸려고 배포하지 않기 위해 (목장주가 직접 화면에서 바꾼다)
--   2) "이미 보낸 기간"을 프로세스 메모리에 두면 재시작마다 잊는다 → 같은 주간 보고서 재발송
--   3) 발송 원장이 있어야 "왜 지난주 메일이 안 왔지"에 답할 수 있다 (실패 사유·테스트모드 포함)
--
-- 멱등의 축: (schedule_id, period_key) 성공 1건. 15분 주기 잡이 몇 번 깨어나도 메일은 한 통.
-- 수동 발송(manual=true)은 이 유니크에서 제외한다 — 사용자가 원할 때 다시 받을 수 있어야 한다.

CREATE TABLE IF NOT EXISTS report_schedules (
  schedule_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         UUID NOT NULL REFERENCES farms(farm_id),
  kind            VARCHAR(16) NOT NULL,            -- weekly | monthly | quarterly | performance
  recipients      JSONB NOT NULL DEFAULT '[]',     -- 수신 이메일 배열
  format          VARCHAR(8) NOT NULL DEFAULT 'xlsx',  -- xlsx | none
  send_hour_kst   INTEGER NOT NULL DEFAULT 7,      -- KST 발송 시각
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  last_period_key VARCHAR(32),
  last_sent_at    TIMESTAMPTZ,
  created_by      UUID REFERENCES users(user_id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT report_schedules_kind_chk
    CHECK (kind IN ('weekly', 'monthly', 'quarterly', 'performance')),
  CONSTRAINT report_schedules_format_chk
    CHECK (format IN ('xlsx', 'none')),
  CONSTRAINT report_schedules_hour_chk
    CHECK (send_hour_kst BETWEEN 0 AND 23)
);

CREATE UNIQUE INDEX IF NOT EXISTS report_schedules_farm_kind_idx
  ON report_schedules(farm_id, kind);
CREATE INDEX IF NOT EXISTS report_schedules_enabled_idx
  ON report_schedules(enabled);

CREATE TABLE IF NOT EXISTS report_deliveries (
  delivery_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id     UUID REFERENCES report_schedules(schedule_id) ON DELETE SET NULL,
  farm_id         UUID NOT NULL REFERENCES farms(farm_id),
  kind            VARCHAR(16) NOT NULL,
  period_key      VARCHAR(32) NOT NULL,
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  recipients      JSONB NOT NULL DEFAULT '[]',
  status          VARCHAR(12) NOT NULL,            -- sent | failed
  subject         TEXT,
  summary         JSONB,                            -- 핵심 수치 스냅샷 (메일이 지워져도 근거가 남는다)
  attachment_name VARCHAR(200),
  test_mode       BOOLEAN NOT NULL DEFAULT FALSE,  -- SMTP 미설정 → 로그만 남은 발송
  manual          BOOLEAN NOT NULL DEFAULT FALSE,  -- 수동 즉시발송
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT report_deliveries_status_chk CHECK (status IN ('sent', 'failed'))
);

-- 정기 발송 멱등: 같은 스케줄·같은 기간의 성공 발송은 한 번뿐
CREATE UNIQUE INDEX IF NOT EXISTS report_deliveries_period_unique_idx
  ON report_deliveries(schedule_id, period_key)
  WHERE status = 'sent' AND manual = FALSE;

CREATE INDEX IF NOT EXISTS report_deliveries_farm_idx
  ON report_deliveries(farm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS report_deliveries_schedule_idx
  ON report_deliveries(schedule_id, period_key);


-- ──────────────────────────────────────────────────────────────────────
-- 1회성 시드 표식
--
-- 이 프로젝트의 마이그레이션은 매 기동마다 전부 재실행된다. 스키마 DDL 은 IF NOT EXISTS 로
-- 멱등하지만 **데이터 시드는 다르다**: 사용자가 지운 구독이 재부팅마다 되살아나고,
-- 무기한으로 바꾼 구독 기간이 다시 1년으로 덮인다.
-- → 시드는 "한 번 적용했다"는 표식을 남기고, 표식이 있으면 다시 손대지 않는다.
--   (사용자가 바꾼 설정을 배포가 되돌리지 않는다 — 자동화가 사람의 결정을 덮으면 안 된다)
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS migration_seed_marks (
  key        TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────────
-- 시드: 술탄목장 정기 보고서 구독 (목장주 요청 — 주간/월간/분기/성과)
-- 농장명 표기가 환경마다 다를 수 있어(술탄목장/술탄팜/sultan) 넓게 매칭한다.
-- migration_seed_marks 표식으로 1회만 적용 — 사용자가 해지한 구독이 재부팅마다 되살아나지 않게.
-- ──────────────────────────────────────────────────────────────────────
INSERT INTO report_schedules (farm_id, kind, recipients, format, send_hour_kst, enabled)
SELECT f.farm_id, k.kind, '["hhj3150@hanmail.net"]'::jsonb, 'xlsx', 7, TRUE
FROM farms f
CROSS JOIN (VALUES ('weekly'), ('monthly'), ('quarterly'), ('performance')) AS k(kind)
WHERE (f.name ILIKE '%술탄%' OR f.name ILIKE '%sultan%')
  AND f.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM migration_seed_marks WHERE key = '0038_sultan_report_schedules')
ON CONFLICT (farm_id, kind) DO NOTHING;

-- 농장이 실제로 있었을 때만 표식을 남긴다 (농장이 아직 없는 환경은 다음 기동에 다시 시도)
INSERT INTO migration_seed_marks (key)
SELECT '0038_sultan_report_schedules'
WHERE EXISTS (
  SELECT 1 FROM farms f
  WHERE (f.name ILIKE '%술탄%' OR f.name ILIKE '%sultan%') AND f.deleted_at IS NULL
)
ON CONFLICT (key) DO NOTHING;
