-- 0017: 지능형 카메라 연동 테이블
-- Phase 1: 카메라 등록 + 추적 이벤트 (하드웨어 없이 SW 준비)

CREATE TABLE IF NOT EXISTS farm_cameras (
  camera_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id       UUID NOT NULL REFERENCES farms(farm_id),
  name          VARCHAR(100) NOT NULL,       -- '1동 PTZ카메라'
  location      VARCHAR(200),                -- '1동 서측'
  model         VARCHAR(100),                -- 'Hikvision DS-2DE4225IW'
  stream_url    VARCHAR(500),                -- rtsp://...
  ptz_control_url VARCHAR(500),
  snapshot_url  VARCHAR(500),
  protocol      VARCHAR(20) DEFAULT 'onvif', -- onvif, rtsp, hls, webrtc
  capabilities  JSONB NOT NULL DEFAULT '{}', -- {ptz, ir, ai, resolution, zoom}
  status        VARCHAR(20) NOT NULL DEFAULT 'offline', -- online, offline, error
  last_heartbeat TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS camera_tracking_events (
  tracking_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id     UUID NOT NULL REFERENCES farm_cameras(camera_id),
  animal_id     UUID REFERENCES animals(animal_id),
  alarm_id      VARCHAR(200),                -- 트리거한 알람 ID
  reason        VARCHAR(100) NOT NULL,       -- 'estrus_alarm', 'mastitis_risk'
  tracking_status VARCHAR(20) NOT NULL DEFAULT 'searching', -- searching, tracking, lost, completed
  identification_method VARCHAR(30),         -- ear_tag_ocr, body_pattern, manual
  confidence    REAL DEFAULT 0,
  snapshot_url  VARCHAR(500),
  clip_url      VARCHAR(500),
  ptz_position  JSONB,                       -- {pan, tilt, zoom}
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  located_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fc_farm ON farm_cameras(farm_id);
CREATE INDEX IF NOT EXISTS idx_cte_camera ON camera_tracking_events(camera_id);
CREATE INDEX IF NOT EXISTS idx_cte_animal ON camera_tracking_events(animal_id);
CREATE INDEX IF NOT EXISTS idx_cte_status ON camera_tracking_events(tracking_status);
