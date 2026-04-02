-- 0010_tool_audit_log.sql
-- MCP Gateway 감사 로그 테이블
-- 모든 AI tool 호출 기록 (who/when/role/tool/params/result)

CREATE TABLE IF NOT EXISTS tool_audit_log (
  log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id VARCHAR(64) NOT NULL,
  user_id UUID,
  role VARCHAR(30) NOT NULL DEFAULT 'unknown',
  farm_id UUID,
  tool_name VARCHAR(100) NOT NULL,
  tool_domain VARCHAR(30) NOT NULL,
  input_summary TEXT NOT NULL,
  result_status VARCHAR(20) NOT NULL DEFAULT 'success',
  result_summary TEXT,
  execution_ms INTEGER NOT NULL DEFAULT 0,
  approval_required BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tool_audit_log_user_id_idx ON tool_audit_log (user_id);
CREATE INDEX IF NOT EXISTS tool_audit_log_tool_name_idx ON tool_audit_log (tool_name);
CREATE INDEX IF NOT EXISTS tool_audit_log_started_at_idx ON tool_audit_log (started_at);
CREATE INDEX IF NOT EXISTS tool_audit_log_request_id_idx ON tool_audit_log (request_id);
