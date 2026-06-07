-- 0023: 수의사 진료센터 — 8단계 KAHIS 약물사용 보고
-- veterinary_drug_reports: 처방대상 약물 기록 강제(오남용 방지) + 상위 DB 보고. visit 1:1.

CREATE TABLE IF NOT EXISTS veterinary_drug_reports (
  report_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL UNIQUE REFERENCES veterinary_visits(visit_id),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  animal_id UUID NOT NULL REFERENCES animals(animal_id),
  vet_id UUID NOT NULL REFERENCES users(user_id),
  drug_name VARCHAR(200),
  drug_code VARCHAR(50),
  is_prescription_target BOOLEAN NOT NULL DEFAULT FALSE,
  dosage VARCHAR(200),
  route VARCHAR(50),
  withdrawal_note TEXT,
  administered_at DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  payload_json JSONB,
  receipt_no VARCHAR(100),
  submitted_at TIMESTAMPTZ,
  response_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS veterinary_drug_reports_visit_id_idx ON veterinary_drug_reports(visit_id);
CREATE INDEX IF NOT EXISTS veterinary_drug_reports_farm_id_idx ON veterinary_drug_reports(farm_id);
CREATE INDEX IF NOT EXISTS veterinary_drug_reports_status_idx ON veterinary_drug_reports(status);
