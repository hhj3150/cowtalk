-- 지역 AI 해석 캐시 — animal_interpretations(0021)의 지역 단위 대응
-- 목적: GET /regional/:regionId 가 매 요청마다 ~40초 deep(Opus) 해석을 동기 대기하던 것을
--   캐시 우선 서빙(<1s)으로 전환하고, profile_hash 가 바뀐 경우에만 백그라운드 재계산.
-- 키: (region_id, role, model) 당 1행 upsert. region_id 는 합성/좌표기반일 수 있어 FK 없음.

CREATE TABLE IF NOT EXISTS regional_interpretations (
  region_id     VARCHAR(64)  NOT NULL,
  role          VARCHAR(30)  NOT NULL,
  model         VARCHAR(64)  NOT NULL,
  profile_hash  VARCHAR(64)  NOT NULL,
  result        JSONB        NOT NULL,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS regional_interpretations_key_idx
  ON regional_interpretations(region_id, role, model);
