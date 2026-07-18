-- 계정 승인 게이트 — 소유자(마스터)가 승인한 계정만 접근 가능
--
-- 정책: 기존 계정 전면 재승인. 이 마이그레이션이 적용되는 순간
-- 소유자 계정을 제외한 모든 계정은 pending으로 내려가 접근이 차단되고,
-- 소유자가 사용자 관리 화면에서 승인한 계정만 다시 접근할 수 있다.

ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'pending';

-- 소유자 계정만 승인 상태로 (Master Admin 명칭 또는 소유자 이메일)
UPDATE users SET approval_status = 'approved'
 WHERE name LIKE '%Master Admin%'
    OR email IN ('ha@d2o.kr', 'hhj3150@hanmail.net');

-- 미승인 계정의 기존 세션(리프레시 토큰) 즉시 폐기 — 이미 로그인된 계정도 차단
DELETE FROM refresh_tokens
 WHERE user_id IN (SELECT user_id FROM users WHERE approval_status <> 'approved');
