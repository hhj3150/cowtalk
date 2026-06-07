-- 0021: 수의사 진료센터 — 3단계 진료기록 수정/이력관리
-- veterinary_visit_revisions: 수정 시 '수정 전 값'을 보존하여 의무기록 불변성/감사추적 확보.
-- snapshot(자동 호출 데이터)은 원진료 시점 그대로 동결 — 수정은 수의사 입력 필드에만 적용.

-- 현재 개정 번호 (수정 시마다 +1)
ALTER TABLE veterinary_visits
  ADD COLUMN IF NOT EXISTS revision_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS veterinary_visit_revisions (
  revision_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL REFERENCES veterinary_visits(visit_id),
  revision_number INTEGER NOT NULL,
  edited_by UUID NOT NULL REFERENCES users(user_id),
  edit_reason TEXT,
  previous_values_json JSONB,  -- 수정 전 값 (변경된 필드만)
  changed_fields JSONB,        -- string[] — 변경된 필드 키 목록
  edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS veterinary_visit_revisions_visit_id_idx ON veterinary_visit_revisions(visit_id);
