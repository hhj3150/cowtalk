-- 0003: smaXtec 이벤트 타입명 통일
-- 기존: temperature_alert, rumination_drop, activity_change, feeding_anomaly
-- 신규: temperature_warning, rumination_warning, activity_warning, feeding_warning
-- 이유: buildGlobalContext / 대시보드 / AI 프롬프트에서 일관된 이름 사용

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'smaxtec_events') THEN
    UPDATE smaxtec_events SET event_type = 'temperature_warning' WHERE event_type = 'temperature_alert';
    UPDATE smaxtec_events SET event_type = 'rumination_warning' WHERE event_type = 'rumination_drop';
    UPDATE smaxtec_events SET event_type = 'activity_warning' WHERE event_type = 'activity_change';
    UPDATE smaxtec_events SET event_type = 'feeding_warning' WHERE event_type = 'feeding_anomaly';
  END IF;
END $$;
