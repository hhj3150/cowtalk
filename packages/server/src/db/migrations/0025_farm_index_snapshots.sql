-- 0025: Farm Intelligence Index 일별 스냅샷
--
-- "오늘의 목장 점수" 추이의 원료. 24h 배치가 농장별 지수를 하루 1행으로 기록한다.
-- 정직성 원칙 유지: overall/grade는 가용 축이 없으면 NULL, coverage를 함께 저장.

CREATE TABLE IF NOT EXISTS farm_index_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  date DATE NOT NULL,
  overall INTEGER,
  grade VARCHAR(2),
  coverage_available INTEGER NOT NULL DEFAULT 0,
  coverage_total INTEGER NOT NULL DEFAULT 5,
  axes JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS farm_index_snapshots_farm_date_idx
  ON farm_index_snapshots (farm_id, date);
CREATE INDEX IF NOT EXISTS farm_index_snapshots_farm_id_idx
  ON farm_index_snapshots (farm_id);
