-- DI-17: 예측·진단이 무엇을 근거로 나왔는지 거슬러 올라갈 수 있게
-- predictions: 원천 smaXtec 이벤트 ID + 원천 참조(알람 서명 등)
-- diagnosis_history: 판단에 쓴 센서 구간(KST 날짜) + 원천 이벤트
-- 컬럼 추가만 (기존 데이터 변경 없음, 재실행 안전)

ALTER TABLE predictions ADD COLUMN IF NOT EXISTS source_event_id UUID;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS source_ref VARCHAR(200);

ALTER TABLE diagnosis_history ADD COLUMN IF NOT EXISTS sensor_window_from DATE;
ALTER TABLE diagnosis_history ADD COLUMN IF NOT EXISTS sensor_window_to DATE;
ALTER TABLE diagnosis_history ADD COLUMN IF NOT EXISTS source_event_id UUID;
