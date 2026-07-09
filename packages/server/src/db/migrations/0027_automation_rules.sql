-- 자동화 룰 엔진 — 알람→조치 자동 연결 (P3 AIP Automate)
-- automation_rules: 트리거(알람 조건) + 액션(도구 호출 템플릿) 정의
-- automation_rule_runs: 실행 기록 (멱등 스윕 — rule+source 유니크)

CREATE TABLE IF NOT EXISTS automation_rules (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID REFERENCES farms(farm_id),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  trigger JSONB NOT NULL,
  action JSONB NOT NULL,
  cooldown_hours INTEGER NOT NULL DEFAULT 24,
  created_by UUID REFERENCES users(user_id),
  actor_role VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automation_rules_farm_id_idx ON automation_rules(farm_id);
CREATE INDEX IF NOT EXISTS automation_rules_enabled_idx ON automation_rules(enabled);

CREATE TABLE IF NOT EXISTS automation_rule_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES automation_rules(rule_id) ON DELETE CASCADE,
  source_type VARCHAR(20) NOT NULL,
  source_id UUID NOT NULL,
  animal_id UUID REFERENCES animals(animal_id),
  farm_id UUID REFERENCES farms(farm_id),
  status VARCHAR(20) NOT NULL,
  result_summary TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 멱등 스윕 보장: 같은 룰이 같은 소스 이벤트를 두 번 처리하지 않음
CREATE UNIQUE INDEX IF NOT EXISTS automation_rule_runs_unique_idx
  ON automation_rule_runs(rule_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS automation_rule_runs_rule_id_idx ON automation_rule_runs(rule_id);
CREATE INDEX IF NOT EXISTS automation_rule_runs_animal_id_idx ON automation_rule_runs(animal_id);
CREATE INDEX IF NOT EXISTS automation_rule_runs_executed_at_idx ON automation_rule_runs(executed_at);
