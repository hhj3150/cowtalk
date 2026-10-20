-- DI-08: animals 식별자 유니크 제약 (중복이 없을 때만 생성 — 데이터 삭제·수정 없음)
--
-- 문제: external_id·trace_id 에 유니크 제약이 없어 동기화·수동 등록이 같은 소를 두 번 만들 수 있었다.
-- 원칙: 이 마이그레이션은 기존 데이터를 지우거나 고치지 않는다. 중복이 이미 있으면 인덱스를 만들지 않고
--       NOTICE 만 남긴다 → 운영자가 중복을 확인·정리(별도 승인)한 뒤 다음 부팅에서 다시 시도된다.
--       (적용 이력 추적: 실패·보류가 아니라 '성공'으로 기록되지 않도록 중복 시 예외를 던진다)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM animals
    WHERE external_id IS NOT NULL AND deleted_at IS NULL
    GROUP BY external_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'DI-08: animals.external_id 중복 존재 — 유니크 인덱스 보류 (정리 후 재시도)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM animals
    WHERE trace_id IS NOT NULL AND trace_id <> '' AND deleted_at IS NULL
    GROUP BY trace_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'DI-08: animals.trace_id 중복 존재 — 유니크 인덱스 보류 (정리 후 재시도)';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS animals_external_id_live_uidx
  ON animals (external_id) WHERE external_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS animals_trace_id_live_uidx
  ON animals (trace_id) WHERE trace_id IS NOT NULL AND trace_id <> '' AND deleted_at IS NULL;
