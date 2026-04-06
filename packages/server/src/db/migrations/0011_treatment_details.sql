-- 0011: treatments 테이블에 details jsonb 컬럼 추가
-- 임상소견, 투여경로, 빈도, 기간, 휴약종료일, 치료결과 추적용

ALTER TABLE treatments ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}';

-- 인덱스: outcomeStatus로 pending 건 빠르게 조회
CREATE INDEX IF NOT EXISTS treatments_outcome_status_idx
  ON treatments ((details->>'outcomeStatus'))
  WHERE details->>'outcomeStatus' IS NOT NULL;
