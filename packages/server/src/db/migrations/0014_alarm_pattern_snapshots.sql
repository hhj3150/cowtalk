-- 0014: alarm_pattern_snapshots — smaXtec 이벤트 전후 48h 센서 스냅샷 자동 캡처
-- 목적: 독립 알람 알고리즘 학습을 위한 패턴 데이터베이스 구축

CREATE TABLE IF NOT EXISTS alarm_pattern_snapshots (
  snapshot_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id          UUID NOT NULL REFERENCES animals(animal_id),
  farm_id            UUID NOT NULL REFERENCES farms(farm_id),
  event_type         VARCHAR(50) NOT NULL,
  event_detected_at  TIMESTAMPTZ NOT NULL,
  smaxtec_event_id   VARCHAR(100),
  sensor_before      JSONB NOT NULL DEFAULT '{}',
  sensor_after       JSONB,
  capture_status     VARCHAR(20) NOT NULL DEFAULT 'before_captured',
  captured_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_aps_animal ON alarm_pattern_snapshots(animal_id);
CREATE INDEX IF NOT EXISTS idx_aps_type ON alarm_pattern_snapshots(event_type);
CREATE INDEX IF NOT EXISTS idx_aps_status ON alarm_pattern_snapshots(capture_status);
CREATE INDEX IF NOT EXISTS idx_aps_farm ON alarm_pattern_snapshots(farm_id);
