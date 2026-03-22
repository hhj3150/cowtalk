-- 농장 수익성 입력 데이터 테이블
-- 개별 농장의 실제 수입/지출 데이터를 저장
-- farmId + period (YYYY-MM) 기준 upsert

CREATE TABLE IF NOT EXISTS farm_profit_entries (
  entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  period VARCHAR(7) NOT NULL,  -- YYYY-MM
  -- 수입 (KRW 정수)
  revenue_milk INTEGER NOT NULL DEFAULT 0,
  revenue_calves INTEGER NOT NULL DEFAULT 0,
  revenue_subsidies INTEGER NOT NULL DEFAULT 0,
  revenue_cull_sales INTEGER NOT NULL DEFAULT 0,
  revenue_other INTEGER NOT NULL DEFAULT 0,
  -- 지출 (KRW 정수)
  cost_feed INTEGER NOT NULL DEFAULT 0,
  cost_vet INTEGER NOT NULL DEFAULT 0,
  cost_breeding INTEGER NOT NULL DEFAULT 0,
  cost_labor INTEGER NOT NULL DEFAULT 0,
  cost_facility INTEGER NOT NULL DEFAULT 0,
  cost_other INTEGER NOT NULL DEFAULT 0,
  -- 타임스탬프
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 농장+기간 unique 제약 (upsert용)
CREATE UNIQUE INDEX IF NOT EXISTS farm_profit_entries_farm_period_idx
  ON farm_profit_entries(farm_id, period);

-- 농장별 조회 인덱스
CREATE INDEX IF NOT EXISTS farm_profit_entries_farm_id_idx
  ON farm_profit_entries(farm_id);
