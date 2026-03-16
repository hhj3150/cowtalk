-- CowTalk v5.0 — 초기 마이그레이션
-- 블루프린트 PART 4 전체 테이블 + TimescaleDB hypertable

-- 확장 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- ======================================================================
-- A. 조직/농장
-- ======================================================================

CREATE TABLE IF NOT EXISTS regions (
  region_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  province VARCHAR(50) NOT NULL,
  district VARCHAR(50) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS farms (
  farm_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(100),
  region_id UUID NOT NULL REFERENCES regions(region_id),
  name VARCHAR(200) NOT NULL,
  address TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 0,
  current_head_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  owner_name VARCHAR(100),
  phone VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS farms_region_id_idx ON farms(region_id);
CREATE INDEX IF NOT EXISTS farms_status_idx ON farms(status);

CREATE TABLE IF NOT EXISTS farm_groups (
  group_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  farm_ids JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================================================================
-- B. 동물
-- ======================================================================

CREATE TABLE IF NOT EXISTS animals (
  animal_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(100),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  ear_tag VARCHAR(50) NOT NULL,
  name VARCHAR(100),
  breed VARCHAR(30) NOT NULL DEFAULT 'holstein',
  sex VARCHAR(10) NOT NULL DEFAULT 'female',
  birth_date DATE,
  parity INTEGER NOT NULL DEFAULT 0,
  days_in_milk INTEGER,
  lactation_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
  current_device_id VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS animals_farm_id_idx ON animals(farm_id);
CREATE INDEX IF NOT EXISTS animals_status_idx ON animals(status);
CREATE INDEX IF NOT EXISTS animals_ear_tag_idx ON animals(ear_tag);

CREATE TABLE IF NOT EXISTS animal_status_history (
  history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  previous_status VARCHAR(20) NOT NULL,
  new_status VARCHAR(20) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by UUID,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS animal_status_history_animal_id_idx ON animal_status_history(animal_id);

-- ======================================================================
-- C. 센서
-- ======================================================================

CREATE TABLE IF NOT EXISTS sensor_devices (
  device_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(100),
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  device_type VARCHAR(30) NOT NULL DEFAULT 'smaxtec_bolus',
  install_date TIMESTAMPTZ NOT NULL,
  remove_date TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS sensor_devices_animal_id_idx ON sensor_devices(animal_id);

-- TimescaleDB hypertable
CREATE TABLE IF NOT EXISTS sensor_measurements (
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  timestamp TIMESTAMPTZ NOT NULL,
  metric_type VARCHAR(30) NOT NULL,
  value REAL NOT NULL,
  quality_flag VARCHAR(10) NOT NULL DEFAULT 'good'
);

SELECT create_hypertable('sensor_measurements', 'timestamp', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS sensor_measurements_animal_id_idx ON sensor_measurements(animal_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS sensor_measurements_metric_type_idx ON sensor_measurements(metric_type, timestamp DESC);

CREATE TABLE IF NOT EXISTS sensor_hourly_agg (
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  hour TIMESTAMPTZ NOT NULL,
  metric_type VARCHAR(30) NOT NULL,
  avg REAL NOT NULL,
  min REAL NOT NULL,
  max REAL NOT NULL,
  stddev REAL NOT NULL DEFAULT 0,
  count INTEGER NOT NULL DEFAULT 0
);

SELECT create_hypertable('sensor_hourly_agg', 'hour', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS sensor_hourly_agg_animal_id_idx ON sensor_hourly_agg(animal_id, hour DESC);

CREATE TABLE IF NOT EXISTS sensor_daily_agg (
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  date DATE NOT NULL,
  metric_type VARCHAR(30) NOT NULL,
  avg REAL NOT NULL,
  min REAL NOT NULL,
  max REAL NOT NULL,
  stddev REAL NOT NULL DEFAULT 0,
  count INTEGER NOT NULL DEFAULT 0
);

-- ======================================================================
-- D. 번식
-- ======================================================================

CREATE TABLE IF NOT EXISTS breeding_events (
  event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  event_date TIMESTAMPTZ NOT NULL,
  type VARCHAR(20) NOT NULL,
  semen_info TEXT,
  technician_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS breeding_events_animal_id_idx ON breeding_events(animal_id);

CREATE TABLE IF NOT EXISTS pregnancy_checks (
  check_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  check_date TIMESTAMPTZ NOT NULL,
  result VARCHAR(20) NOT NULL,
  method VARCHAR(30) NOT NULL,
  days_post_insemination INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pregnancy_checks_animal_id_idx ON pregnancy_checks(animal_id);

CREATE TABLE IF NOT EXISTS calving_events (
  event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  calving_date TIMESTAMPTZ NOT NULL,
  calf_sex VARCHAR(10),
  calf_status VARCHAR(20),
  complications TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calving_events_animal_id_idx ON calving_events(animal_id);

-- ======================================================================
-- E. 건강
-- ======================================================================

CREATE TABLE IF NOT EXISTS health_events (
  event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  event_date TIMESTAMPTZ NOT NULL,
  diagnosis VARCHAR(200) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS health_events_animal_id_idx ON health_events(animal_id);

CREATE TABLE IF NOT EXISTS treatments (
  treatment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  health_event_id UUID NOT NULL REFERENCES health_events(event_id),
  drug VARCHAR(200) NOT NULL,
  dosage VARCHAR(100),
  withdrawal_days INTEGER NOT NULL DEFAULT 0,
  administered_by UUID,
  administered_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS treatments_health_event_id_idx ON treatments(health_event_id);

CREATE TABLE IF NOT EXISTS vet_visits (
  visit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  vet_id UUID NOT NULL,
  visit_date TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vet_visits_farm_id_idx ON vet_visits(farm_id);

-- ======================================================================
-- F. 생산
-- ======================================================================

CREATE TABLE IF NOT EXISTS milk_records (
  record_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  date DATE NOT NULL,
  yield REAL NOT NULL,
  fat REAL,
  protein REAL,
  scc INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS milk_records_animal_id_idx ON milk_records(animal_id);

CREATE TABLE IF NOT EXISTS lactation_records (
  record_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  lactation_number INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  total_yield REAL
);

CREATE INDEX IF NOT EXISTS lactation_records_animal_id_idx ON lactation_records(animal_id);

-- ======================================================================
-- G. 피처
-- ======================================================================

CREATE TABLE IF NOT EXISTS animal_features (
  feature_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  timestamp TIMESTAMPTZ NOT NULL,
  feature_name VARCHAR(100) NOT NULL,
  value REAL NOT NULL,
  version VARCHAR(20) NOT NULL DEFAULT '1.0'
);

CREATE INDEX IF NOT EXISTS animal_features_animal_id_idx ON animal_features(animal_id);
CREATE INDEX IF NOT EXISTS animal_features_feature_name_idx ON animal_features(feature_name);

CREATE TABLE IF NOT EXISTS feature_definitions (
  feature_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  source VARCHAR(50) NOT NULL,
  calculation TEXT NOT NULL,
  engine_usage JSONB NOT NULL,
  version VARCHAR(20) NOT NULL DEFAULT '1.0'
);

-- ======================================================================
-- H. AI 예측
-- ======================================================================

CREATE TABLE IF NOT EXISTS predictions (
  prediction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  engine_type VARCHAR(30) NOT NULL,
  animal_id UUID REFERENCES animals(animal_id),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  timestamp TIMESTAMPTZ NOT NULL,
  probability REAL NOT NULL,
  confidence REAL NOT NULL,
  severity VARCHAR(20) NOT NULL,
  rank_score REAL NOT NULL,
  prediction_label VARCHAR(200) NOT NULL,
  explanation_text TEXT NOT NULL,
  contributing_features JSONB NOT NULL,
  recommended_action TEXT NOT NULL,
  model_version VARCHAR(50) NOT NULL,
  role_specific JSONB NOT NULL,
  data_quality JSONB,
  feature_snapshot_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS predictions_engine_type_idx ON predictions(engine_type);
CREATE INDEX IF NOT EXISTS predictions_animal_id_idx ON predictions(animal_id);
CREATE INDEX IF NOT EXISTS predictions_farm_id_idx ON predictions(farm_id);
CREATE INDEX IF NOT EXISTS predictions_timestamp_idx ON predictions(timestamp DESC);

CREATE TABLE IF NOT EXISTS model_registry (
  model_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  engine_type VARCHAR(30) NOT NULL,
  model_type VARCHAR(20) NOT NULL DEFAULT 'rule_based',
  version VARCHAR(50) NOT NULL,
  metrics JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(engine_type, version)
);

-- ======================================================================
-- I. 알림
-- ======================================================================

CREATE TABLE IF NOT EXISTS alerts (
  alert_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_type VARCHAR(30) NOT NULL,
  engine_type VARCHAR(30),
  animal_id UUID REFERENCES animals(animal_id),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  prediction_id UUID REFERENCES predictions(prediction_id),
  priority VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new',
  title VARCHAR(300) NOT NULL,
  explanation TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  dedup_key VARCHAR(200) NOT NULL,
  cooldown_until TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alerts_farm_id_idx ON alerts(farm_id);
CREATE INDEX IF NOT EXISTS alerts_animal_id_idx ON alerts(animal_id);
CREATE INDEX IF NOT EXISTS alerts_status_idx ON alerts(status);
CREATE INDEX IF NOT EXISTS alerts_priority_idx ON alerts(priority);
CREATE INDEX IF NOT EXISTS alerts_dedup_key_idx ON alerts(dedup_key);

CREATE TABLE IF NOT EXISTS alert_history (
  history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id UUID NOT NULL REFERENCES alerts(alert_id),
  previous_status VARCHAR(20) NOT NULL,
  new_status VARCHAR(20) NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS alert_history_alert_id_idx ON alert_history(alert_id);

CREATE TABLE IF NOT EXISTS notification_log (
  notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id UUID NOT NULL REFERENCES alerts(alert_id),
  channel VARCHAR(20) NOT NULL,
  recipient_id UUID NOT NULL,
  recipient_address VARCHAR(200) NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS notification_log_alert_id_idx ON notification_log(alert_id);

-- ======================================================================
-- J. 피드백
-- ======================================================================

CREATE TABLE IF NOT EXISTS feedback (
  feedback_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prediction_id UUID REFERENCES predictions(prediction_id),
  alert_id UUID REFERENCES alerts(alert_id),
  animal_id UUID REFERENCES animals(animal_id),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  feedback_type VARCHAR(30) NOT NULL,
  feedback_value INTEGER,
  source_role VARCHAR(30) NOT NULL,
  recorded_by UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_prediction_id_idx ON feedback(prediction_id);
CREATE INDEX IF NOT EXISTS feedback_farm_id_idx ON feedback(farm_id);

CREATE TABLE IF NOT EXISTS outcome_evaluations (
  evaluation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prediction_id UUID NOT NULL REFERENCES predictions(prediction_id),
  actual_outcome TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  match_result VARCHAR(30) NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evaluated_by UUID,
  details JSONB
);

CREATE INDEX IF NOT EXISTS outcome_evaluations_prediction_id_idx ON outcome_evaluations(prediction_id);

-- ======================================================================
-- K. 사용자
-- ======================================================================

CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(200) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  role VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

CREATE TABLE IF NOT EXISTS user_farm_access (
  user_id UUID NOT NULL REFERENCES users(user_id),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  permission_level VARCHAR(20) NOT NULL DEFAULT 'read',
  PRIMARY KEY (user_id, farm_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(50) NOT NULL,
  resource_id UUID,
  details JSONB,
  ip_address VARCHAR(50),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_user_id_idx ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS audit_log_timestamp_idx ON audit_log(timestamp DESC);

-- ======================================================================
-- L. 지역
-- ======================================================================

CREATE TABLE IF NOT EXISTS regional_daily_summary (
  summary_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id UUID NOT NULL REFERENCES regions(region_id),
  date DATE NOT NULL,
  metrics JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS regional_daily_summary_region_id_idx ON regional_daily_summary(region_id);
CREATE INDEX IF NOT EXISTS regional_daily_summary_date_idx ON regional_daily_summary(date);

CREATE TABLE IF NOT EXISTS farm_daily_summary (
  summary_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  date DATE NOT NULL,
  metrics JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS farm_daily_summary_farm_id_idx ON farm_daily_summary(farm_id);
CREATE INDEX IF NOT EXISTS farm_daily_summary_date_idx ON farm_daily_summary(date);

-- ======================================================================
-- M. 파이프라인 감사
-- ======================================================================

CREATE TABLE IF NOT EXISTS data_sources (
  source_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type VARCHAR(50) NOT NULL,
  config JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  run_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES data_sources(source_id),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  records_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS ingestion_runs_source_id_idx ON ingestion_runs(source_id);
CREATE INDEX IF NOT EXISTS ingestion_runs_status_idx ON ingestion_runs(status);
