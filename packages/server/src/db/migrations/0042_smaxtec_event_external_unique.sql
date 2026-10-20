-- DI-10: smaxtec_events.external_event_id 유니크 (중복이 없을 때만 — 데이터 삭제·수정 없음)
-- 동기화는 '조회 후 삽입'이라 여러 인스턴스가 동시에 돌면 같은 이벤트가 두 번 들어갈 수 있었다.
-- 이미 중복이 있으면 예외로 보류 → 적용 이력에 남지 않아, 정리(별도 승인) 후 다음 부팅에 다시 시도된다.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM smaxtec_events
    WHERE external_event_id IS NOT NULL
    GROUP BY external_event_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'DI-10: smaxtec_events.external_event_id 중복 존재 — 유니크 인덱스 보류 (정리 후 재시도)';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS smaxtec_events_external_event_id_uidx
  ON smaxtec_events (external_event_id) WHERE external_event_id IS NOT NULL;
