-- DI-14: smaXtec 에서 가져온 번식·임신 기록의 출처를 별도 컬럼으로
-- 예전엔 사람이 수정할 수 있는 notes 문자열('smaxtec:<id>')로 중복을 판정했다 — 메모를 고치면 다음 동기화에서
-- 같은 기록이 다시 만들어졌다. 컬럼 추가만 (기존 행 값 채우기는 운영 데이터 변경이라 하지 않는다 —
-- 동기화는 새 컬럼과 옛 notes 둘 다로 중복을 판정한다).

ALTER TABLE breeding_events ADD COLUMN IF NOT EXISTS source_event_id VARCHAR(200);
ALTER TABLE pregnancy_checks ADD COLUMN IF NOT EXISTS source_event_id VARCHAR(200);

CREATE UNIQUE INDEX IF NOT EXISTS breeding_events_source_event_id_uidx
  ON breeding_events (source_event_id) WHERE source_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pregnancy_checks_source_event_id_uidx
  ON pregnancy_checks (source_event_id) WHERE source_event_id IS NOT NULL;
