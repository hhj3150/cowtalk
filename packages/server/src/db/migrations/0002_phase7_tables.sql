-- CowTalk v5.0 — Phase 7 마이그레이션: 18개 신규 테이블

-- ======================================================================
-- A-0. 멀티테넌트
-- ======================================================================

CREATE TABLE IF NOT EXISTS tenants (
  tenant_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  tenant_type VARCHAR(30) NOT NULL,
  scope JSONB NOT NULL DEFAULT '[]',
  contact_name VARCHAR(100),
  contact_email VARCHAR(200),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================================================================
-- K-2. 리프레시 토큰
-- ======================================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  token_hash VARCHAR(500) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_token_hash_idx ON refresh_tokens(token_hash);

-- ======================================================================
-- N. 처방전
-- ======================================================================

CREATE TABLE IF NOT EXISTS drug_database (
  drug_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL,
  withdrawal_milk_days INTEGER NOT NULL DEFAULT 0,
  withdrawal_meat_days INTEGER NOT NULL DEFAULT 0,
  unit VARCHAR(30) NOT NULL DEFAULT 'ml',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS drug_database_category_idx ON drug_database(category);

CREATE TABLE IF NOT EXISTS prescriptions (
  prescription_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  vet_id UUID NOT NULL REFERENCES users(user_id),
  diagnosis VARCHAR(300) NOT NULL,
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  prescribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prescriptions_animal_id_idx ON prescriptions(animal_id);
CREATE INDEX IF NOT EXISTS prescriptions_farm_id_idx ON prescriptions(farm_id);
CREATE INDEX IF NOT EXISTS prescriptions_vet_id_idx ON prescriptions(vet_id);
CREATE INDEX IF NOT EXISTS prescriptions_status_idx ON prescriptions(status);

CREATE TABLE IF NOT EXISTS prescription_items (
  item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prescription_id UUID NOT NULL REFERENCES prescriptions(prescription_id),
  drug_id UUID NOT NULL REFERENCES drug_database(drug_id),
  dosage VARCHAR(100) NOT NULL,
  frequency VARCHAR(100) NOT NULL,
  duration_days INTEGER NOT NULL,
  route VARCHAR(50) NOT NULL DEFAULT 'oral',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS prescription_items_prescription_id_idx ON prescription_items(prescription_id);
CREATE INDEX IF NOT EXISTS prescription_items_drug_id_idx ON prescription_items(drug_id);

-- ======================================================================
-- O. 백신
-- ======================================================================

CREATE TABLE IF NOT EXISTS vaccine_schedules (
  schedule_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  vaccine_name VARCHAR(200) NOT NULL,
  scheduled_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vaccine_schedules_farm_id_idx ON vaccine_schedules(farm_id);
CREATE INDEX IF NOT EXISTS vaccine_schedules_animal_id_idx ON vaccine_schedules(animal_id);
CREATE INDEX IF NOT EXISTS vaccine_schedules_status_idx ON vaccine_schedules(status);
CREATE INDEX IF NOT EXISTS vaccine_schedules_scheduled_date_idx ON vaccine_schedules(scheduled_date);

CREATE TABLE IF NOT EXISTS vaccine_records (
  record_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID REFERENCES vaccine_schedules(schedule_id),
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  vaccine_name VARCHAR(200) NOT NULL,
  batch_number VARCHAR(100),
  administered_by UUID REFERENCES users(user_id),
  administered_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vaccine_records_animal_id_idx ON vaccine_records(animal_id);
CREATE INDEX IF NOT EXISTS vaccine_records_farm_id_idx ON vaccine_records(farm_id);

-- ======================================================================
-- P. 농장 이벤트
-- ======================================================================

CREATE TABLE IF NOT EXISTS farm_events (
  event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  animal_id UUID REFERENCES animals(animal_id),
  event_type VARCHAR(50) NOT NULL,
  sub_type VARCHAR(50),
  description TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'normal',
  recorded_by UUID NOT NULL REFERENCES users(user_id),
  event_date TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  ai_processed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS farm_events_farm_id_idx ON farm_events(farm_id);
CREATE INDEX IF NOT EXISTS farm_events_animal_id_idx ON farm_events(animal_id);
CREATE INDEX IF NOT EXISTS farm_events_event_type_idx ON farm_events(event_type);
CREATE INDEX IF NOT EXISTS farm_events_event_date_idx ON farm_events(event_date);
CREATE INDEX IF NOT EXISTS farm_events_ai_processed_idx ON farm_events(ai_processed);

CREATE TABLE IF NOT EXISTS event_attachments (
  attachment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES farm_events(event_id),
  file_type VARCHAR(30) NOT NULL,
  file_url TEXT NOT NULL,
  file_name VARCHAR(300),
  file_size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_attachments_event_id_idx ON event_attachments(event_id);

-- ======================================================================
-- Q. 경제성
-- ======================================================================

CREATE TABLE IF NOT EXISTS farm_economics (
  economics_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  period VARCHAR(20) NOT NULL,
  revenue JSONB NOT NULL DEFAULT '{}',
  costs JSONB NOT NULL DEFAULT '{}',
  profit_margin REAL,
  cost_per_head REAL,
  revenue_per_head REAL,
  notes TEXT,
  recorded_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS farm_economics_farm_id_idx ON farm_economics(farm_id);
CREATE INDEX IF NOT EXISTS farm_economics_period_idx ON farm_economics(period);

CREATE TABLE IF NOT EXISTS feed_programs (
  program_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  name VARCHAR(200) NOT NULL,
  target_group VARCHAR(50) NOT NULL,
  ingredients JSONB NOT NULL,
  daily_cost_per_head REAL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feed_programs_farm_id_idx ON feed_programs(farm_id);

-- ======================================================================
-- R. 농장 학습 프로필
-- ======================================================================

CREATE TABLE IF NOT EXISTS farm_learning_profiles (
  profile_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  feedback_history JSONB NOT NULL DEFAULT '[]',
  accuracy_metrics JSONB NOT NULL DEFAULT '{}',
  preference_weights JSONB NOT NULL DEFAULT '{}',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS farm_learning_profiles_farm_id_idx ON farm_learning_profiles(farm_id);

-- ======================================================================
-- S. 에스컬레이션
-- ======================================================================

CREATE TABLE IF NOT EXISTS alert_escalations (
  escalation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id UUID NOT NULL REFERENCES alerts(alert_id),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  escalation_level INTEGER NOT NULL DEFAULT 1,
  escalated_to UUID REFERENCES users(user_id),
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(user_id),
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alert_escalations_alert_id_idx ON alert_escalations(alert_id);
CREATE INDEX IF NOT EXISTS alert_escalations_farm_id_idx ON alert_escalations(farm_id);
CREATE INDEX IF NOT EXISTS alert_escalations_status_idx ON alert_escalations(status);
CREATE INDEX IF NOT EXISTS alert_escalations_escalation_level_idx ON alert_escalations(escalation_level);

-- ======================================================================
-- T. 알림 설정
-- ======================================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
  preference_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  farm_id UUID REFERENCES farms(farm_id),
  channel VARCHAR(30) NOT NULL,
  alert_types JSONB NOT NULL DEFAULT '[]',
  min_severity VARCHAR(20) NOT NULL DEFAULT 'medium',
  quiet_hours_start VARCHAR(5),
  quiet_hours_end VARCHAR(5),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_preferences_user_id_idx ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS notification_preferences_farm_id_idx ON notification_preferences(farm_id);

-- ======================================================================
-- U. 분만 체크리스트
-- ======================================================================

CREATE TABLE IF NOT EXISTS calving_checklists (
  checklist_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  calving_event_id UUID NOT NULL REFERENCES calving_events(event_id),
  calf_id UUID REFERENCES animals(animal_id),
  colostrum_fed BOOLEAN NOT NULL DEFAULT FALSE,
  colostrum_timestamp TIMESTAMPTZ,
  navel_treated BOOLEAN NOT NULL DEFAULT FALSE,
  weight_kg REAL,
  vitality VARCHAR(20),
  notes TEXT,
  completed_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calving_checklists_calving_event_id_idx ON calving_checklists(calving_event_id);
CREATE INDEX IF NOT EXISTS calving_checklists_calf_id_idx ON calving_checklists(calf_id);

-- ======================================================================
-- V. 정액/유전체
-- ======================================================================

CREATE TABLE IF NOT EXISTS semen_catalog (
  semen_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bull_name VARCHAR(200) NOT NULL,
  bull_registration VARCHAR(100),
  breed VARCHAR(50) NOT NULL,
  supplier VARCHAR(200),
  price_per_straw REAL,
  genomic_traits JSONB NOT NULL DEFAULT '{}',
  available_straws INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS semen_catalog_breed_idx ON semen_catalog(breed);

CREATE TABLE IF NOT EXISTS farm_semen_inventory (
  inventory_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  semen_id UUID NOT NULL REFERENCES semen_catalog(semen_id),
  quantity INTEGER NOT NULL DEFAULT 0,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS farm_semen_inventory_farm_id_idx ON farm_semen_inventory(farm_id);
CREATE INDEX IF NOT EXISTS farm_semen_inventory_semen_id_idx ON farm_semen_inventory(semen_id);

CREATE TABLE IF NOT EXISTS genomic_data (
  genomic_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  test_date DATE NOT NULL,
  provider VARCHAR(100),
  traits JSONB NOT NULL DEFAULT '{}',
  reliability_percent REAL,
  raw_data_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS genomic_data_animal_id_idx ON genomic_data(animal_id);
