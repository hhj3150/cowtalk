-- DI-14: milk_records (animal_id, date) 유니크 (중복이 없을 때만 — 데이터 삭제·수정 없음)
-- 서비스는 '같은 날짜는 갱신'인데 제약이 없어 동시 입력(업로드·음성)이 같은 날 2건을 만들 수 있었다.
-- 이미 중복이 있으면 예외로 보류 → 정리(별도 승인) 후 다음 부팅에 다시 시도된다.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM milk_records GROUP BY animal_id, date HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'DI-14: milk_records (animal_id, date) 중복 존재 — 유니크 인덱스 보류 (정리 후 재시도)';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS milk_records_animal_date_uidx ON milk_records (animal_id, date);
