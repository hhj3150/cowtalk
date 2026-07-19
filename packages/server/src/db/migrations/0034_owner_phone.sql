-- 송영신목장 목장주(hhj3150) 전화번호 등록 — 아침 브리핑 수신처
-- 소유자 본인 확인 완료 (2026-07-19). 이후 UI에서 변경한 값을 덮어쓰지 않도록
-- phone이 비어 있을 때만 1회 설정한다.

UPDATE users SET phone = '010-6205-3150', updated_at = now()
 WHERE email = 'hhj3150' AND phone IS NULL;
