-- AI-08: AI 출력 재현·감사를 위한 출처 정보
-- 대화: 어떤 모델·어떤 시스템 프롬프트로 답했는지 / 예측: 어떤 입력으로 판단했는지 /
-- 브리핑: 메모리 캐시에만 있던 생성 결과를 근거 수치와 함께 보존.
-- 컬럼·테이블 추가만 (기존 데이터 변경 없음, 재실행 안전)

ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS model VARCHAR(100);
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS prompt_hash VARCHAR(64);

ALTER TABLE predictions ADD COLUMN IF NOT EXISTS input_hash VARCHAR(64);

CREATE TABLE IF NOT EXISTS ai_briefing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR(30) NOT NULL,
  farm_id UUID REFERENCES farms(farm_id),
  facts JSONB NOT NULL,
  summary TEXT NOT NULL,
  recommendations JSONB NOT NULL DEFAULT '[]',
  model VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_briefing_log_created_at_idx ON ai_briefing_log (created_at);
