-- 0022: 수의사 진료센터 — 면허/병원 마스터 + 문서 전달 이력
-- veterinarian_profiles: 문서 발행 시 면허번호·병원정보 자동 기입 (user 1:1)
-- veterinary_document_deliveries: 발행 문서 전달(보내기) 이력 영속화 (5단계)

CREATE TABLE IF NOT EXISTS veterinarian_profiles (
  profile_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(user_id),
  license_number VARCHAR(50),
  clinic_name VARCHAR(200),
  clinic_address TEXT,
  clinic_phone VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS veterinarian_profiles_user_id_idx ON veterinarian_profiles(user_id);

CREATE TABLE IF NOT EXISTS veterinary_document_deliveries (
  delivery_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL REFERENCES veterinary_visits(visit_id),
  farm_id UUID NOT NULL REFERENCES farms(farm_id),
  doc_type VARCHAR(30) NOT NULL,
  sent_by UUID NOT NULL REFERENCES users(user_id),
  recipient_name VARCHAR(100),
  channel VARCHAR(20) NOT NULL DEFAULT 'in_app',
  note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'sent',
  push_delivered INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS veterinary_document_deliveries_visit_id_idx ON veterinary_document_deliveries(visit_id);
CREATE INDEX IF NOT EXISTS veterinary_document_deliveries_farm_id_idx ON veterinary_document_deliveries(farm_id);
