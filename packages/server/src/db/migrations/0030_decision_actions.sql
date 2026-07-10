-- 결정 카드 조치 기록 — "알람 → 행동 완결"의 마지막 조각
-- 기존에는 완료 처리가 브라우저 localStorage에만 저장돼 기기·사용자 간 공유 불가 + 완결률 측정 불가.
-- card_id는 결정 큐가 합성하는 결정적 ID (`source:개체:시각`)라 재조회 시에도 동일하다.

CREATE TABLE IF NOT EXISTS decision_actions (
  action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id VARCHAR(200) NOT NULL,
  farm_id UUID REFERENCES farms(farm_id),
  animal_id UUID REFERENCES animals(animal_id),
  source VARCHAR(20) NOT NULL,          -- sovereign | smaxtec | breeding
  severity VARCHAR(20) NOT NULL,
  title VARCHAR(300) NOT NULL,          -- 카드 스냅샷 (알람 만료 후에도 완결 이력 보존)
  status VARCHAR(20) NOT NULL DEFAULT 'done',
  acted_by UUID REFERENCES users(user_id),
  acted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 카드당 1행 — 완료는 농장 단위 공유 (같은 카드를 두 명이 각각 완료하지 않음)
CREATE UNIQUE INDEX IF NOT EXISTS decision_actions_card_idx ON decision_actions(card_id);
CREATE INDEX IF NOT EXISTS decision_actions_farm_idx ON decision_actions(farm_id);
CREATE INDEX IF NOT EXISTS decision_actions_acted_at_idx ON decision_actions(acted_at);
