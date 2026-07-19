-- 우군 일별 기록에 자체가공 물량 추가 — 3단 유대 구조 (쿼터/초과/자체가공)
--
-- 일별 총 유량에서 자체가공 물량을 떼고, 남은 납유분을 1일 쿼터량(경제 파라미터
-- daily_quota_l) 기준으로 쿼터 내(납유 단가)/초과(가공유 단가)로 자동 배분한다.

ALTER TABLE farm_milk_summary ADD COLUMN IF NOT EXISTS self_processed_yield_l REAL;
