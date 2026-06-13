-- 정액 추천 기록 테이블 — 추천 정확도 추적 (CLAUDE.md 4층 Intelligence Loop)
-- AI가 추천한 정액을 영속화 → 실제 사용(breeding_events)·임신 결과(pregnancy_checks)와
-- 사후 대조하여 추천 채택률·정확도(lift)를 측정한다.

CREATE TABLE IF NOT EXISTS semen_recommendations (
  recommendation_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id              UUID         NOT NULL,
  animal_id             UUID         NOT NULL REFERENCES animals(animal_id),
  farm_id               UUID         NOT NULL,
  semen_id              VARCHAR(64)  NOT NULL,
  rank                  INTEGER      NOT NULL,
  score                 REAL         NOT NULL,
  estimated_inbreeding  REAL         NOT NULL,
  inbreeding_risk       VARCHAR(10)  NOT NULL,
  past_conception_rate  REAL,
  past_sample_size      INTEGER      NOT NULL DEFAULT 0,
  learning_bonus        REAL         NOT NULL DEFAULT 0,
  heat_detected_at      TIMESTAMPTZ,
  recommended_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS semen_recommendations_animal_id_idx     ON semen_recommendations(animal_id);
CREATE INDEX IF NOT EXISTS semen_recommendations_farm_id_idx       ON semen_recommendations(farm_id);
CREATE INDEX IF NOT EXISTS semen_recommendations_semen_id_idx      ON semen_recommendations(semen_id);
CREATE INDEX IF NOT EXISTS semen_recommendations_batch_id_idx      ON semen_recommendations(batch_id);
CREATE INDEX IF NOT EXISTS semen_recommendations_recommended_at_idx ON semen_recommendations(recommended_at);
