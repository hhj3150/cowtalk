-- smaxtec_events 드릴다운 쿼리 가속용 복합 인덱스
-- 패턴: WHERE event_type = ? AND detected_at >= ? ORDER BY detected_at DESC LIMIT 200
-- 기존 단일 인덱스 (event_type_idx, detected_at_idx)만으로는 7천두 규모에서 15s 초과 발생.
-- (event_type, detected_at DESC) 복합 인덱스로 직접 seek + range scan 가능하게 함.

CREATE INDEX IF NOT EXISTS smaxtec_events_event_type_detected_at_idx
  ON smaxtec_events (event_type, detected_at DESC);

-- 농장+유형 드릴다운 (farmId 지정 시) 가속
CREATE INDEX IF NOT EXISTS smaxtec_events_farm_event_detected_idx
  ON smaxtec_events (farm_id, event_type, detected_at DESC);
