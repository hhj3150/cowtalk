-- OPS-12: 브라우저 푸시 구독 영속화 — 예전엔 메모리 Map 에만 있어 재시작마다 전원 구독이 사라지고
-- 레플리카마다 따로였다. 테이블 추가만 (기존 데이터 변경 없음, 재실행 안전)

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  -- true = 전 농장 알림 (구독 시점에 농장 제한이 없는 계정). false 면 발송 시점의 user_farm_access 로 판정
  all_farms BOOLEAN NOT NULL DEFAULT false,
  min_severity VARCHAR(10) NOT NULL DEFAULT 'high',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions (user_id);
