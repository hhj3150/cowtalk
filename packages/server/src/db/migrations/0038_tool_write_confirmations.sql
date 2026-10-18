-- 기록 도구 확인 대기 (Write Confirmation) — AI가 진료·번식 기록을 확인 없이 저장하지 못하게 한다
--
-- 흐름:
--   1) AI가 기록 도구를 처음 부르면 저장하지 않고 이 테이블에 "제안"만 남긴다 (status=awaiting)
--   2) 사용자에게 요약을 보여주고 묻는다
--   3) 사용자가 **다음 발화**에서 명시적으로 승인하면, AI가 confirmation_id로 다시 부른다
--   4) 게이트웨이가 원자적으로 선점(awaiting → executed)하고 **제안 당시 저장된 입력**으로 실행한다
--
-- 왜 turn_id 인가: 같은 대화 턴 안에서 AI가 스스로 확인하는 것을 막는다 (사람의 다음 발화가 필요).
-- 왜 저장된 입력으로 실행하나: 확인 직전에 AI가 개체·용량을 바꿔 넣는 것을 막는다.
-- 왜 선점(claim)인가: 재시도·중복 호출에도 한 번만 실행된다 (멱등).
-- 추가 전용 마이그레이션 — 기존 테이블·데이터를 변경하지 않는다.

CREATE TABLE IF NOT EXISTS tool_write_confirmations (
  confirmation_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name        VARCHAR(60) NOT NULL,
  tool_input       JSONB NOT NULL DEFAULT '{}',
  user_id          UUID REFERENCES users(user_id),
  role             VARCHAR(30) NOT NULL,
  farm_id          UUID REFERENCES farms(farm_id),
  turn_id          VARCHAR(64) NOT NULL,
  summary          TEXT NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'awaiting',  -- awaiting | executed | cancelled | failed
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL,
  decided_at       TIMESTAMPTZ,
  execution_result JSONB
);

CREATE INDEX IF NOT EXISTS tool_write_confirmations_user_status_idx
  ON tool_write_confirmations (user_id, status);
