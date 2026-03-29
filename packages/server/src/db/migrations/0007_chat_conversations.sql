-- 팅커벨 대화 로그 + 학습 신호 저장
-- 대화가 곧 기록: 진단/치료/번식 정보를 자동 추출하여 AI 강화 학습

CREATE TABLE IF NOT EXISTS chat_conversations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(user_id),
  role            VARCHAR(30) NOT NULL,
  animal_id       UUID        REFERENCES animals(animal_id),
  farm_id         UUID        REFERENCES farms(farm_id),
  question        TEXT        NOT NULL,
  answer          TEXT        NOT NULL,
  context_type    VARCHAR(20),  -- animal/farm/global/general
  learning_signals JSONB      NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_conversations_user_id_idx ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS chat_conversations_animal_id_idx ON chat_conversations(animal_id);
CREATE INDEX IF NOT EXISTS chat_conversations_farm_id_idx ON chat_conversations(farm_id);
CREATE INDEX IF NOT EXISTS chat_conversations_created_at_idx ON chat_conversations(created_at DESC);
