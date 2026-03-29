-- farms 테이블에 breeding_settings JSONB 컬럼 추가
-- 목장별 smaXtec 번식 설정 (발정재귀일, 수정적기, 임신감정시기 등)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farms' AND column_name = 'breeding_settings'
  ) THEN
    ALTER TABLE farms ADD COLUMN breeding_settings JSONB NOT NULL DEFAULT '{}';
  END IF;
END $$;
