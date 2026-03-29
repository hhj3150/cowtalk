-- 0009: 방역 시스템 테이블 — 역학조사, 가축이동, 방역조치, KAHIS 보고

-- ======================================================================
-- 역학조사 (investigations)
-- ======================================================================

CREATE TABLE IF NOT EXISTS investigations (
  investigation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  initiated_by UUID REFERENCES users(user_id),
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  fever_animals JSONB NOT NULL DEFAULT '[]'::jsonb,
  radius_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact_network JSONB NOT NULL DEFAULT '{}'::jsonb,
  weather JSONB NOT NULL DEFAULT '{}'::jsonb,
  nearby_abnormal_farms INTEGER NOT NULL DEFAULT 0,
  field_observations TEXT NOT NULL DEFAULT '',
  cluster_id UUID REFERENCES disease_clusters(cluster_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investigations_farm_id_idx ON investigations(farm_id);
CREATE INDEX IF NOT EXISTS investigations_status_idx ON investigations(status);
CREATE INDEX IF NOT EXISTS investigations_created_at_idx ON investigations(created_at);

-- ======================================================================
-- 가축 이동이력 (animal_transfers)
-- ======================================================================

CREATE TABLE IF NOT EXISTS animal_transfers (
  transfer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  source_farm_id UUID NOT NULL REFERENCES farms(farm_id),
  destination_farm_id UUID NOT NULL REFERENCES farms(farm_id),
  transfer_date TIMESTAMPTZ NOT NULL,
  head_count INTEGER NOT NULL DEFAULT 1,
  reason VARCHAR(30) NOT NULL DEFAULT 'other',
  trace_no VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS animal_transfers_animal_id_idx ON animal_transfers(animal_id);
CREATE INDEX IF NOT EXISTS animal_transfers_source_farm_id_idx ON animal_transfers(source_farm_id);
CREATE INDEX IF NOT EXISTS animal_transfers_dest_farm_id_idx ON animal_transfers(destination_farm_id);
CREATE INDEX IF NOT EXISTS animal_transfers_transfer_date_idx ON animal_transfers(transfer_date);

-- ======================================================================
-- 방역조치 (quarantine_actions)
-- ======================================================================

CREATE TABLE IF NOT EXISTS quarantine_actions (
  action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  investigation_id UUID REFERENCES investigations(investigation_id),
  cluster_id UUID REFERENCES disease_clusters(cluster_id),
  action_type VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  description TEXT NOT NULL DEFAULT '',
  assigned_to UUID REFERENCES users(user_id),
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quarantine_actions_farm_id_idx ON quarantine_actions(farm_id);
CREATE INDEX IF NOT EXISTS quarantine_actions_status_idx ON quarantine_actions(status);
CREATE INDEX IF NOT EXISTS quarantine_actions_action_type_idx ON quarantine_actions(action_type);
CREATE INDEX IF NOT EXISTS quarantine_actions_investigation_id_idx ON quarantine_actions(investigation_id);

-- ======================================================================
-- KAHIS 보고 (kahis_reports)
-- ======================================================================

CREATE TABLE IF NOT EXISTS kahis_reports (
  report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id UUID NOT NULL REFERENCES investigations(investigation_id),
  report_type VARCHAR(20) NOT NULL,
  disease_code VARCHAR(10) NOT NULL,
  disease_name VARCHAR(100) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  response_at TIMESTAMPTZ,
  report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kahis_reports_investigation_id_idx ON kahis_reports(investigation_id);
CREATE INDEX IF NOT EXISTS kahis_reports_status_idx ON kahis_reports(status);
CREATE INDEX IF NOT EXISTS kahis_reports_disease_code_idx ON kahis_reports(disease_code);
