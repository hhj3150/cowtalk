-- 우군(농장) 단위 유량·유성분 기록 + 개체 기록 유당 추가
--
-- 배경 (파일럿 요구):
-- - 개체별 기록이 어려운 날도 우군 전체 평균 성적(벌크탱크 기준)은 기록할 수 있어야 한다
-- - 유대단가는 목장마다 다르다 (납유 조합/유업체별 단가, 유기농 납유, 직접 가공·판매)
--   → 파라미터 추정 대신 실제 단가를 기록하면 그 값이 우선 적용된다
-- - 유당(lactose)도 검정성적 항목이므로 개체·우군 모두 기록 가능해야 한다

ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS lactose REAL;

CREATE TABLE IF NOT EXISTS farm_milk_summary (
  summary_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  date DATE NOT NULL,
  milking_count INTEGER,          -- 착유 두수
  total_yield_l REAL,             -- 총 유량 (벌크탱크 기준)
  avg_yield_per_cow_l REAL,       -- 두당 평균 유량 (총량 미기록 시)
  avg_fat REAL,                   -- 평균 유지방 (%)
  avg_protein REAL,               -- 평균 유단백 (%)
  avg_lactose REAL,               -- 평균 유당 (%)
  avg_scc INTEGER,                -- 평균 체세포 (천/mL)
  price_krw_per_l REAL,           -- 실제 유대/판매 단가 (원/L) — 기록 시 추정보다 우선
  note TEXT,
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS farm_milk_summary_farm_date_idx
  ON farm_milk_summary(farm_id, date);
