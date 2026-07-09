-- 프롬프트 개선 루프 (4층 Intelligence Loop 마지막 단계)
-- 실측 라벨(sovereign_alarm_labels) 집계 → 규칙 기반 가이던스 텍스트 생성 → 팅커벨 프롬프트 주입.
-- LLM이 자기 프롬프트를 재작성하지 않는다 — 결정적(rule-based)이고 감사 가능한 텍스트만 저장.

CREATE TABLE IF NOT EXISTS prompt_guidances (
  guidance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID REFERENCES farms(farm_id),   -- NULL = 전국(글로벌) 가이던스
  alarm_type VARCHAR(50) NOT NULL,
  guidance_text TEXT NOT NULL,
  source_stats JSONB NOT NULL DEFAULT '{}', -- {totalLabels, fpRate, confirmRate, modifiedRate, windowDays}
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- farm_id NULL(글로벌)과 농장별을 각각 유니크로 — 배치 upsert의 멱등성 보장
CREATE UNIQUE INDEX IF NOT EXISTS prompt_guidances_farm_type_idx
  ON prompt_guidances(farm_id, alarm_type) WHERE farm_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS prompt_guidances_global_type_idx
  ON prompt_guidances(alarm_type) WHERE farm_id IS NULL;
CREATE INDEX IF NOT EXISTS prompt_guidances_active_idx ON prompt_guidances(active);
