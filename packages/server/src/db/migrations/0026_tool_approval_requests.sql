-- 0026: 도구 승인 요청 — AIP 거버넌스 (알람→행동 사이의 승인 게이트)
--
-- 고위험 도구(예: 호르몬 동기화 처방 schedule_sync_protocol)를 farmer가 요청하면
-- 즉시 실행하지 않고 여기 기록 → 수의사가 승인하면 그 시점에 실행된다.
-- 실행 자체는 기존 tool-gateway를 그대로 통과 (감사 로그 이중 기록).

CREATE TABLE IF NOT EXISTS tool_approval_requests (
  approval_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_name VARCHAR(60) NOT NULL,
  tool_input JSONB NOT NULL DEFAULT '{}',
  requested_by UUID REFERENCES users(user_id),
  requested_role VARCHAR(30) NOT NULL,
  farm_id UUID REFERENCES farms(farm_id),
  request_note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  approver_id UUID REFERENCES users(user_id),
  decision_note TEXT,
  decided_at TIMESTAMPTZ,
  execution_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tool_approval_requests_status_idx ON tool_approval_requests (status);
CREATE INDEX IF NOT EXISTS tool_approval_requests_farm_id_idx ON tool_approval_requests (farm_id);
