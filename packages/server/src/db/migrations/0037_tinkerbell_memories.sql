-- 팅커벨 장기기억 (Tinkerbell Memory) — 대화 강화 학습의 기억 층
--
-- 기존 학습 루프가 못 담던 것을 담는다:
--   chat_conversations   → 원문 로그 (검색용, 프롬프트에 못 넣음)
--   learning_signals     → 임상 '사건' (진단/치료/번식) — 이벤트로 흘러감
--   prompt_guidances     → 알람 통계 기반 자기보정 (라벨 10건 이상 필요)
--   tinkerbell_memories  → **사용자가 말해준 지속되는 사실** (이 파일)
--
-- 원칙:
-- 1) 기억은 '사실'이 아니라 '사용자가 말한 것'이다 — 출처 원문(source_quote)을 항상 보존한다.
-- 2) 반복 언급은 강화(evidence_count↑, confidence↑), 모순은 대체(superseded)하되 이력을 지운다.
-- 3) 사용자가 언제든 보고·고치고·지울 수 있어야 한다 (status=rejected로 소프트 삭제).
-- 4) 확인되지 않은 기억은 시간이 지나면 신뢰도가 떨어진다 (decay) — 오래된 오해가 영구화되지 않게.
-- 5) 기억은 계정의 권한 안에서만 회상된다 (아래 스코프 규칙 참조).
--
-- 스코프 = 권한 경계 (memory.service.ts의 MemoryAccess가 이 규칙을 집행한다):
--   user   — 오직 그 계정만. 관리자·마스터도 타인의 개인 기억은 볼 수 없다.
--   farm   — 그 농장에 배정된 계정만 (목장주 + 담당 수의사). 목장 사실은 공유가 목적이다.
--   animal — 그 개체가 속한 농장 권한으로 판정. 그래서 개체 기억도 farm_id를 함께 갖는다
--            (비정규화가 아니라 권한 판정의 전제 — farm_id 없이는 누가 볼 수 있는지 알 수 없다).
-- CHECK 제약으로 스코프별 필수 키를 DB 레벨에서 강제해, 권한 판정 불가능한 행이 아예 생기지 않게 한다.

CREATE TABLE IF NOT EXISTS tinkerbell_memories (
  memory_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 스코프: 어느 범위에서 이 기억을 떠올릴 것인가
  scope          VARCHAR(10) NOT NULL,            -- user | farm | animal
  user_id        UUID REFERENCES users(user_id),
  farm_id        UUID REFERENCES farms(farm_id),
  animal_id      UUID REFERENCES animals(animal_id),

  category       VARCHAR(20) NOT NULL,            -- farm_fact | protocol | preference | constraint | equipment | economics | person | goal | animal_fact
  subject        VARCHAR(120) NOT NULL,           -- 정규화 주제 키 ("착유설비", "덱사메타손", "우유 판매단가")
  content        TEXT NOT NULL,                   -- 한 문장 사실 ("착유는 Lely A3 로봇착유기 1대로 한다")

  confidence     REAL NOT NULL DEFAULT 0.6,       -- 0~1
  importance     INTEGER NOT NULL DEFAULT 3,      -- 1~5 (프롬프트 주입 우선순위)
  evidence_count INTEGER NOT NULL DEFAULT 1,      -- 같은 내용이 몇 번 확인됐는가 (강화 횟수)

  status         VARCHAR(12) NOT NULL DEFAULT 'active',  -- active | superseded | rejected | expired
  superseded_by  UUID,                            -- 이 기억을 대체한 새 기억 (모순 갱신 이력)

  source         VARCHAR(16) NOT NULL DEFAULT 'chat_auto', -- chat_auto | user_explicit | correction | manual
  source_conversation_id UUID REFERENCES chat_conversations(id),
  source_quote   TEXT,                            -- 근거가 된 사용자 원문 (정직성 — 기억의 출처를 숨기지 않는다)

  keywords       JSONB NOT NULL DEFAULT '[]',     -- 회상 매칭용 토큰 배열

  created_by     UUID REFERENCES users(user_id),
  last_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 스코프별 필수 키 — 권한 판정이 불가능한 행을 애초에 만들지 못하게 한다.
  -- (개체 기억에 farm_id가 없으면 "누가 이 기억을 볼 수 있는가"에 답할 수 없다)
  CONSTRAINT tinkerbell_memories_scope_keys CHECK (
    (scope = 'user'   AND user_id   IS NOT NULL) OR
    (scope = 'farm'   AND farm_id   IS NOT NULL) OR
    (scope = 'animal' AND animal_id IS NOT NULL AND farm_id IS NOT NULL)
  )
);

-- 회상 경로: 스코프별 활성 기억 조회
CREATE INDEX IF NOT EXISTS tinkerbell_memories_farm_idx
  ON tinkerbell_memories(farm_id, status);
CREATE INDEX IF NOT EXISTS tinkerbell_memories_user_idx
  ON tinkerbell_memories(user_id, status);
CREATE INDEX IF NOT EXISTS tinkerbell_memories_animal_idx
  ON tinkerbell_memories(animal_id, status);
CREATE INDEX IF NOT EXISTS tinkerbell_memories_confirmed_idx
  ON tinkerbell_memories(last_confirmed_at);

-- 같은 스코프·주제의 활성 기억은 하나만 — 중복 축적 방지 (통합은 애플리케이션에서 수행,
-- 이 인덱스는 동시 쓰기에 대한 안전망). NULL을 nil UUID로 접어 NULL-distinct 문제를 피한다.
CREATE UNIQUE INDEX IF NOT EXISTS tinkerbell_memories_subject_key_idx
  ON tinkerbell_memories(
    scope,
    COALESCE(user_id,   '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(farm_id,   '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(animal_id, '00000000-0000-0000-0000-000000000000'::uuid),
    category,
    subject
  ) WHERE status = 'active';
