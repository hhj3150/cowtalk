-- OPS-06: smaXtec 동기화 핫패스 인덱스
-- 동기화가 매 사이클 external_event_id·external_id 로 중복을 확인하고, 번식·임신감정 자동 기록은
-- notes = 'smaxtec:<id>' 로 중복을 확인하는데 인덱스가 없어 재시작 때 수십만 건 순차 스캔이 일어났다.
-- 인덱스 추가만 (데이터 변경 없음). IF NOT EXISTS 로 재실행 안전.

CREATE INDEX IF NOT EXISTS smaxtec_events_external_event_id_idx ON smaxtec_events (external_event_id);
CREATE INDEX IF NOT EXISTS animals_external_id_idx ON animals (external_id);
CREATE INDEX IF NOT EXISTS breeding_events_smaxtec_notes_idx ON breeding_events (notes) WHERE notes LIKE 'smaxtec:%';
CREATE INDEX IF NOT EXISTS pregnancy_checks_smaxtec_notes_idx ON pregnancy_checks (notes) WHERE notes LIKE 'smaxtec:%';
