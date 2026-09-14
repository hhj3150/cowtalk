-- 군 센서 개요 (herd-sensor-overview) — 품종·지역·전국 기준 집계는 개체가 아니라
-- (metric_type, date) 로 sensor_daily_agg 를 훑는다. 기존 인덱스는 animal_id 선행이라
-- 전국 스캔이 full scan 이 되므로 (metric_type, date) 복합 인덱스를 추가한다.
-- 마이그레이션은 매 기동 시 전체 재실행되므로 IF NOT EXISTS 로 멱등.
CREATE INDEX IF NOT EXISTS sensor_daily_agg_metric_date_idx
  ON sensor_daily_agg (metric_type, date);
