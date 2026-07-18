-- 경제 파라미터 오버라이드 — "경제 계산식 하드코딩 금지" 원칙
--
-- 기본값은 코드 카탈로그(@cowtalk/shared ECONOMIC_PARAMETER_DEFS)에 있고,
-- 이 테이블은 오버라이드만 저장한다:
--   farm_id NULL  = 글로벌 오버라이드 (government_admin)
--   farm_id 지정  = 농장별 오버라이드 (해당 농장 farmer / government_admin)
-- 유효값 = 기본값 < 글로벌 < 농장별 순으로 덮어쓴다.

CREATE TABLE IF NOT EXISTS economic_parameters (
  param_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID REFERENCES farms(farm_id),   -- NULL = 글로벌 오버라이드
  param_key VARCHAR(50) NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  updated_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 글로벌/농장별 각각 유니크 — upsert 멱등성 (prompt_guidances 와 동일 패턴)
CREATE UNIQUE INDEX IF NOT EXISTS economic_parameters_farm_key_idx
  ON economic_parameters(farm_id, param_key) WHERE farm_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS economic_parameters_global_key_idx
  ON economic_parameters(param_key) WHERE farm_id IS NULL;
