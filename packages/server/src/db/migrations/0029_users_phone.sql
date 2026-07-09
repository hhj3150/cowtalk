-- 사용자 연락처 — 승인 요청 알림톡 등 역할 기반 알림 발송용
-- (기존에는 farms.phone(농장주)만 있어 수의사·행정관에게 알림톡을 보낼 수 없었음)

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
