-- AI 해석 캐시 테이블 — deep(Opus 4.8) 해석 결과 영속화
-- 목적: GET /animals/:id/interpretation 이 매 요청마다 ~40초 Claude 호출을 던지고 버리던 문제 제거.
--   캐시 히트면 즉시 서빙하고, profile_hash 가 바뀐 경우에만 백그라운드 재계산한다.
-- 키: (animal_id, role, model) 당 1행 upsert. profile_hash 로 staleness 를 판별한다.

CREATE TABLE IF NOT EXISTS animal_interpretations (
  animal_id     UUID         NOT NULL REFERENCES animals(animal_id),
  role          VARCHAR(30)  NOT NULL,
  model         VARCHAR(64)  NOT NULL,
  profile_hash  VARCHAR(64)  NOT NULL,
  result        JSONB        NOT NULL,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS animal_interpretations_key_idx
  ON animal_interpretations(animal_id, role, model);
