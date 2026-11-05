-- 행동 일별 지표 — 우군·그룹 단위 휴식(횡와)·기립·이동·반추 자세
-- 출처(source)와 무관한 일반 저장소. 같은 농장·그룹·날짜·출처는 한 행(재업로드 시 갱신).
-- 멱등: IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS behavior_daily (
  behavior_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(farm_id),
  group_key varchar(20) NOT NULL DEFAULT 'all',
  date date NOT NULL,
  source varchar(30) NOT NULL,
  lying_hours real,
  standing_hours real,
  standing_active_hours real,
  standing_inactive_hours real,
  moving_hours real,
  rumination_lying_min real,
  rumination_standing_min real,
  rumination_lying_pct real,
  rumination_standing_pct real,
  peak_lying_sync_pct real,
  animal_count integer,
  raw jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS behavior_daily_unique_idx
  ON behavior_daily (farm_id, group_key, date, source);
CREATE INDEX IF NOT EXISTS behavior_daily_farm_date_idx
  ON behavior_daily (farm_id, date);
