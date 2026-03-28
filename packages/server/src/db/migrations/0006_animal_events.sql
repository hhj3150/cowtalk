-- 개체 이벤트 통합 로그 테이블
-- 9종 이벤트: calving | insemination | pregnancy_check | treatment | dry_off | dhi | cull | vaccination | herd_move

CREATE TABLE IF NOT EXISTS animal_events (
  event_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id       UUID        NOT NULL REFERENCES animals(animal_id),
  farm_id         UUID        NOT NULL REFERENCES farms(farm_id),
  event_type      VARCHAR(30) NOT NULL,
  event_date      TIMESTAMPTZ NOT NULL,
  recorded_by     UUID,
  recorded_by_name VARCHAR(100),
  details         JSONB       NOT NULL DEFAULT '{}',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS animal_events_animal_id_idx  ON animal_events(animal_id);
CREATE INDEX IF NOT EXISTS animal_events_farm_id_idx    ON animal_events(farm_id);
CREATE INDEX IF NOT EXISTS animal_events_event_type_idx ON animal_events(event_type);
CREATE INDEX IF NOT EXISTS animal_events_event_date_idx ON animal_events(event_date DESC);
