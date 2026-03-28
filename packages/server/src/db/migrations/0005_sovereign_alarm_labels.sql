-- 소버린 AI 알람 레이블 테이블
CREATE TABLE IF NOT EXISTS sovereign_alarm_labels (
  label_id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  alarm_signature   VARCHAR(200) NOT NULL UNIQUE,
  animal_id         UUID         NOT NULL REFERENCES animals(animal_id),
  farm_id           UUID         NOT NULL REFERENCES farms(farm_id),
  alarm_type        VARCHAR(50)  NOT NULL,
  predicted_severity VARCHAR(20) NOT NULL,
  verdict           VARCHAR(20)  NOT NULL,
  notes             TEXT,
  labeled_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sovereign_alarm_labels_farm_id_idx    ON sovereign_alarm_labels(farm_id);
CREATE INDEX IF NOT EXISTS sovereign_alarm_labels_animal_id_idx  ON sovereign_alarm_labels(animal_id);
CREATE INDEX IF NOT EXISTS sovereign_alarm_labels_labeled_at_idx ON sovereign_alarm_labels(labeled_at);
