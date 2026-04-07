-- 0012: 감별진단 결과 히스토리 테이블
-- 진단 실행 시마다 결과를 저장하여 시간별 추적 + AI 학습 데이터 축적

CREATE TABLE IF NOT EXISTS diagnosis_history (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id     uuid NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  farm_id       uuid REFERENCES farms(id) ON DELETE SET NULL,
  requested_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  symptoms      text[] DEFAULT '{}',
  candidates    jsonb NOT NULL DEFAULT '[]',
  urgency_level text NOT NULL DEFAULT 'routine',
  data_quality  text NOT NULL DEFAULT 'limited',
  top_disease   text,
  top_probability numeric(5,2),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 인덱스: 개체별 시간순 조회
CREATE INDEX IF NOT EXISTS diagnosis_history_animal_idx
  ON diagnosis_history (animal_id, created_at DESC);

-- 인덱스: 농장별 최근 진단 조회
CREATE INDEX IF NOT EXISTS diagnosis_history_farm_idx
  ON diagnosis_history (farm_id, created_at DESC);

-- 인덱스: 질병별 통계
CREATE INDEX IF NOT EXISTS diagnosis_history_disease_idx
  ON diagnosis_history (top_disease)
  WHERE top_disease IS NOT NULL;
