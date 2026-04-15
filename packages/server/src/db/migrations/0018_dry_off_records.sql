-- 건유 기록 테이블 — schema.ts에 정의되었으나 마이그레이션 누락 상태였음
-- breeding-timeline API가 이 테이블 미존재로 인해 catch 블록에서 빈 배열만 반환하던 버그 해결

CREATE TABLE IF NOT EXISTS dry_off_records (
  record_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id             UUID        NOT NULL REFERENCES animals(animal_id),
  dry_off_date          DATE        NOT NULL,
  expected_calving_date DATE,
  last_milking_date     DATE,
  dry_off_method        VARCHAR(20) NOT NULL DEFAULT 'gradual',
  medication            VARCHAR(200),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dry_off_records_animal_id_idx ON dry_off_records(animal_id);
