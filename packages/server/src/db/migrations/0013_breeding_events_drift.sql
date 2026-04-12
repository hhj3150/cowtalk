-- 0013: breeding_events 스키마 드리프트 해소
-- 원인: Drizzle schema.ts에는 semen_id, farm_id, technician_name,
-- recommended_semen_id, optimal_time, no_insemination_reason 컬럼이 있지만
-- 0001_initial.sql에서 누락되어 프로덕션 DB에 반영되지 않았다.
-- breeding-advisor.service.ts가 `be.semen_id`를 SELECT하다가 500 에러.
--
-- 재실행 안전: ALTER TABLE IF NOT EXISTS 사용 불가하므로 DO 블록으로 가드.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'breeding_events' AND column_name = 'farm_id') THEN
    ALTER TABLE breeding_events ADD COLUMN farm_id UUID REFERENCES farms(farm_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'breeding_events' AND column_name = 'semen_id') THEN
    ALTER TABLE breeding_events ADD COLUMN semen_id UUID REFERENCES semen_catalog(semen_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'breeding_events' AND column_name = 'technician_name') THEN
    ALTER TABLE breeding_events ADD COLUMN technician_name VARCHAR(100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'breeding_events' AND column_name = 'recommended_semen_id') THEN
    ALTER TABLE breeding_events ADD COLUMN recommended_semen_id UUID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'breeding_events' AND column_name = 'optimal_time') THEN
    ALTER TABLE breeding_events ADD COLUMN optimal_time TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'breeding_events' AND column_name = 'no_insemination_reason') THEN
    ALTER TABLE breeding_events ADD COLUMN no_insemination_reason VARCHAR(200);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS breeding_events_farm_id_idx ON breeding_events(farm_id);
CREATE INDEX IF NOT EXISTS breeding_events_semen_id_idx ON breeding_events(semen_id);
