-- 0020: 수의사 진료센터 (Veterinary Clinical Record Module) — 1단계
-- veterinary_visits: 개체 중심 진료기록 (자동 호출 snapshot + 수의사 입력 결합)
-- veterinary_visit_snapshots: 진료 시점 자동 호출 데이터 동결 (발행 후 불변 보장)

CREATE TABLE IF NOT EXISTS veterinary_visits (
  visit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  veterinarian_id UUID NOT NULL REFERENCES users(user_id),
  visit_datetime TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 수의사 입력
  visit_reason TEXT,
  chief_complaint TEXT,
  farmer_statement TEXT,
  physical_exam TEXT,
  clinical_findings TEXT,
  differential_diagnosis TEXT,
  final_diagnosis TEXT,
  treatment TEXT,
  prescription TEXT,
  medication TEXT,
  withdrawal_period TEXT,
  prognosis TEXT,
  follow_up_date DATE,
  farmer_instruction TEXT,
  quarantine_required BOOLEAN NOT NULL DEFAULT FALSE,
  veterinarian_notes TEXT,
  -- 연계 참조
  sensor_alert_id UUID REFERENCES smaxtec_events(event_id),
  public_data_reference_id VARCHAR(100),
  -- 상태/대화형 기록
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  raw_conversation_note TEXT,
  ai_structured_note_json JSONB,
  ai_confidence_score REAL,
  veterinarian_confirmed_ai_note BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ,
  -- 현장 기록 메타
  input_method VARCHAR(20) NOT NULL DEFAULT 'manual',
  field_visit_location TEXT,
  gps_latitude REAL,
  gps_longitude REAL,
  offline_draft_id VARCHAR(100),
  -- 농장주 확인/서명
  farmer_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  farmer_signature_image_url TEXT,
  farmer_acknowledged_at TIMESTAMPTZ,
  withdrawal_period_notified BOOLEAN NOT NULL DEFAULT FALSE,
  -- 동기화/타임스탬프
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS veterinary_visits_farm_id_idx ON veterinary_visits(farm_id);
CREATE INDEX IF NOT EXISTS veterinary_visits_animal_id_idx ON veterinary_visits(animal_id);
CREATE INDEX IF NOT EXISTS veterinary_visits_vet_id_idx ON veterinary_visits(veterinarian_id);
CREATE INDEX IF NOT EXISTS veterinary_visits_visit_datetime_idx ON veterinary_visits(visit_datetime);
CREATE INDEX IF NOT EXISTS veterinary_visits_status_idx ON veterinary_visits(status);

CREATE TABLE IF NOT EXISTS veterinary_visit_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL REFERENCES veterinary_visits(visit_id),
  farm_snapshot_json JSONB,
  animal_snapshot_json JSONB,
  reproduction_snapshot_json JSONB,
  health_history_snapshot_json JSONB,
  sensor_snapshot_json JSONB,
  public_data_snapshot_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS veterinary_visit_snapshots_visit_id_idx ON veterinary_visit_snapshots(visit_id);
