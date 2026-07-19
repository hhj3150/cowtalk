-- 송영신목장 목장주 계정 발급 — 소유자 지시 (2026-07-19)
--
-- 아이디: hhj3150 (일반 아이디 로그인 — loginIdSchema 완화와 함께 배포)
-- 역할: farmer / 승인: approved / 배정: 이름에 '송영신'이 들어가는 농장
-- 비밀번호는 bcrypt 해시만 저장 (평문은 저장소에 없음)
-- 멱등: 계정·배정 모두 존재하면 건너뜀 (부팅 auto-migrate 재실행 안전)

INSERT INTO users (name, email, password_hash, role, status, approval_status)
SELECT '송영신 목장주', 'hhj3150',
       '$2a$12$6wzCo6QYeG1/IUl/JVkIz.JL/W8cEVN9lQzglJbceCBJdYbuyZWbu',
       'farmer', 'active', 'approved'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'hhj3150');

INSERT INTO user_farm_access (user_id, farm_id, permission_level)
SELECT u.user_id, f.farm_id, 'write'
FROM users u
JOIN farms f ON f.name LIKE '%송영신%' AND f.deleted_at IS NULL
WHERE u.email = 'hhj3150'
  AND NOT EXISTS (
    SELECT 1 FROM user_farm_access ufa
    WHERE ufa.user_id = u.user_id AND ufa.farm_id = f.farm_id
  );
