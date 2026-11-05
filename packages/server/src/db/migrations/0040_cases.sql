-- 관리 케이스 (Case) — "알림"이 아니라 "사건" 단위로 관리한다
--
-- 왜 필요한가:
--   decision_actions 는 카드당 1행 status='done' 이다. 즉 체크박스 한 번.
--   "알림을 읽었다"와 "문제가 해결되었다"가 같은 버튼이면
--   (1) 누가 책임지는지, (2) 실제로 뭘 했는지, (3) 그 뒤 좋아졌는지가 남지 않는다.
--   센서값은 문제를 '발견'하는 근거일 뿐이고, 플랫폼에 축적돼야 할 자산은
--   "어떤 상황에서 무엇을 했고 결과가 어땠는가"라는 현장 결과다.
--
-- 설계 원칙:
--   1) 비파괴 — decision_actions 는 그대로 둔다. 케이스는 source_ref 로 그것을 참조만 한다.
--      (기존 조치 기록률 지표·완료 토글 UX가 깨지지 않는다)
--   2) 이력 보존 — 배정을 위임해도 이전 배정 행을 지우지 않고 superseded_at 만 찍는다.
--      최종 책임자(owner_id)는 케이스에 남아 책임 소재가 사라지지 않는다.
--   3) 단계는 기록이다 — 상태(status)는 case_events 에서 파생되는 요약이고,
--      진실은 이벤트 행에 있다. 상태만 바꾸고 근거를 안 남기는 경로를 만들지 않는다.
--   4) 종료에는 결과가 필수 — 개선/지속/악화/다른원인/판정불가.
--      '판정 불가'를 없애면 통계가 거짓말을 한다.
--   5) 마이그레이션은 매 기동 재실행되므로 전부 IF NOT EXISTS / 멱등으로 쓴다.

CREATE TABLE IF NOT EXISTS cases (
  case_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id             UUID NOT NULL REFERENCES farms(farm_id),
  animal_id           UUID REFERENCES animals(animal_id),
  source              VARCHAR(20) NOT NULL,
  source_ref          VARCHAR(200),
  severity            VARCHAR(20) NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'detected',
  title               VARCHAR(300) NOT NULL,
  detected_signals    JSONB NOT NULL DEFAULT '[]'::jsonb,
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  owner_id            UUID REFERENCES users(user_id),
  current_assignee_id UUID REFERENCES users(user_id),
  due_at              TIMESTAMPTZ,
  last_field_check_at TIMESTAMPTZ,
  last_treatment_at   TIMESTAMPTZ,
  last_recheck_at     TIMESTAMPTZ,
  worsened_observed   BOOLEAN NOT NULL DEFAULT FALSE,
  closed_at           TIMESTAMPTZ,
  outcome             VARCHAR(20),
  outcome_notes       TEXT NOT NULL DEFAULT '',
  outcome_snapshot    JSONB,
  created_by          UUID REFERENCES users(user_id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cases_status_valid CHECK (
    status IN ('detected', 'assigned', 'field_checked', 'treated', 'rechecking', 'closed')
  ),
  CONSTRAINT cases_severity_valid CHECK (
    severity IN ('critical', 'high', 'medium', 'low')
  ),
  CONSTRAINT cases_source_valid CHECK (
    source IN ('decision_card', 'sovereign_alarm', 'smaxtec_event', 'breeding', 'manual')
  ),
  CONSTRAINT cases_outcome_valid CHECK (
    outcome IS NULL OR outcome IN ('improved', 'ongoing', 'worsened', 'other_cause', 'undetermined')
  ),
  -- 종료는 결과 없이 성립하지 않는다. 반대로 열린 케이스에 결과가 붙어서도 안 된다.
  CONSTRAINT cases_closed_needs_outcome CHECK (
    (status = 'closed' AND outcome IS NOT NULL AND closed_at IS NOT NULL)
    OR (status <> 'closed' AND outcome IS NULL AND closed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS cases_farm_idx ON cases(farm_id);
CREATE INDEX IF NOT EXISTS cases_animal_idx ON cases(animal_id);
CREATE INDEX IF NOT EXISTS cases_status_idx ON cases(status);
CREATE INDEX IF NOT EXISTS cases_assignee_idx ON cases(current_assignee_id);
CREATE INDEX IF NOT EXISTS cases_detected_at_idx ON cases(detected_at DESC);

-- 같은 출처로 케이스를 두 번 열지 않는다 (결정 카드 중복 승격 방지).
-- source_ref IS NULL(수동 케이스)은 여러 건 허용 — 부분 유니크로 처리한다.
CREATE UNIQUE INDEX IF NOT EXISTS cases_source_ref_idx
  ON cases(source_ref) WHERE source_ref IS NOT NULL;

-- 열린 케이스만 훑는 목록 조회가 가장 잦다 (오늘 할 일 화면)
CREATE INDEX IF NOT EXISTS cases_open_idx
  ON cases(farm_id, detected_at DESC) WHERE status <> 'closed';

CREATE TABLE IF NOT EXISTS case_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       UUID NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  assignee_id   UUID NOT NULL REFERENCES users(user_id),
  support_ids   JSONB NOT NULL DEFAULT '[]'::jsonb,
  due_at        TIMESTAMPTZ,
  assigned_by   UUID REFERENCES users(user_id),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS case_assignments_case_idx ON case_assignments(case_id);
CREATE INDEX IF NOT EXISTS case_assignments_assignee_idx ON case_assignments(assignee_id);

-- 한 케이스에 유효한 배정은 하나뿐이다 (위임은 이전 행을 superseded 로 닫고 새 행을 만든다)
CREATE UNIQUE INDEX IF NOT EXISTS case_assignments_active_idx
  ON case_assignments(case_id) WHERE superseded_at IS NULL;

CREATE TABLE IF NOT EXISTS case_events (
  event_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          UUID NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  event_type       VARCHAR(20) NOT NULL,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by      UUID REFERENCES users(user_id),
  recorded_by_name VARCHAR(100),
  notes            TEXT NOT NULL DEFAULT '',
  details          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT case_events_type_valid CHECK (
    event_type IN (
      'detected', 'assigned', 'reassigned', 'field_check',
      'treatment', 'recheck', 'note', 'reopened', 'closed'
    )
  )
);

CREATE INDEX IF NOT EXISTS case_events_case_idx ON case_events(case_id);
CREATE INDEX IF NOT EXISTS case_events_type_idx ON case_events(event_type);
CREATE INDEX IF NOT EXISTS case_events_occurred_at_idx ON case_events(occurred_at DESC);
