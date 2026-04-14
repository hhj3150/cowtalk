-- 0015: 알람 타입별 학습 임계값 제안 테이블
-- threshold-learner가 sovereign_alarm_labels를 분석하여 주기적으로 업데이트

CREATE TABLE IF NOT EXISTS threshold_suggestions (
  suggestion_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alarm_type      VARCHAR(50) NOT NULL,
  farm_id         UUID REFERENCES farms(farm_id),  -- NULL이면 전체 농장 글로벌
  -- 성능 지표 (sovereign_alarm_labels 기반)
  total_labels    INT NOT NULL DEFAULT 0,
  confirmed_count INT NOT NULL DEFAULT 0,
  fp_count        INT NOT NULL DEFAULT 0,
  modified_count  INT NOT NULL DEFAULT 0,
  confirm_rate    REAL NOT NULL DEFAULT 0,
  fp_rate         REAL NOT NULL DEFAULT 0,
  -- 조정 제안
  confidence_multiplier REAL NOT NULL DEFAULT 1.0,   -- 알람 confidence에 곱할 배수
  severity_adjustment   VARCHAR(20),                  -- upgrade/downgrade/keep
  suggested_action      TEXT,                          -- 사람이 읽을 설명
  -- 추세 (이전 분석 대비)
  trend                 VARCHAR(20) DEFAULT 'stable',  -- improving/worsening/stable
  previous_confirm_rate REAL,
  -- 메타
  analysis_window_days  INT NOT NULL DEFAULT 90,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ts_alarm_type ON threshold_suggestions(alarm_type);
CREATE INDEX idx_ts_farm_id ON threshold_suggestions(farm_id);
CREATE INDEX idx_ts_computed_at ON threshold_suggestions(computed_at);
-- 알람타입+농장 당 최신 1건만 의미 있으므로 UNIQUE는 걸지 않음 (이력 보존)
