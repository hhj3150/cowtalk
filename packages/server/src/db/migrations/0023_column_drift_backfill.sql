-- 0023: 스키마-마이그레이션 컬럼 드리프트 백필
-- schema.ts에는 정의되어 있으나 마이그레이션이 만들지 않던 컬럼 4건.
-- (신규 DB에서 통합검색의 animals.trace_id 조회, refresh 토큰 무효화(revoked_at) 등이
--  "column does not exist"로 실패하던 문제 해결)
-- 모든 구문은 멱등 — 기존 DB에는 영향 없음.

-- 이력제 번호 (12자리) — smaXtec official_id 매핑. CLAUDE.md 소 번호 체계 1번.
ALTER TABLE animals ADD COLUMN IF NOT EXISTS trace_id VARCHAR(20);

-- 품종 구분 (dairy/hanwoo) — 정액 추천 시 동일 품종 강제에 사용.
ALTER TABLE animals ADD COLUMN IF NOT EXISTS breed_type VARCHAR(10) NOT NULL DEFAULT 'dairy';

-- 멀티테넌트 확장용 (tenants 테이블은 0002에서 생성).
ALTER TABLE farms ADD COLUMN IF NOT EXISTS tenant_id UUID;
DO $$ BEGIN
  ALTER TABLE farms ADD CONSTRAINT farms_tenant_id_tenants_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- schema.ts(user.repo.ts)는 revoked_at을 사용 — 0002의 revoked(boolean)와 병존.
-- 기존 revoked=true 토큰은 revoked_at으로 이관해 무효 상태를 유지한다.
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
DO $$ BEGIN
  -- revoked 컬럼은 마이그레이션 경로(0002)에만 존재 — drizzle push로 만든 DB에는 없다.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'refresh_tokens' AND column_name = 'revoked'
  ) THEN
    UPDATE refresh_tokens SET revoked_at = NOW() WHERE revoked = TRUE AND revoked_at IS NULL;
  END IF;
END $$;
