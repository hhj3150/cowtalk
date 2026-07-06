-- 0024: 지도 오배치 목장 초기 좌표 보정 — 송영신목장(안성) + 필리핀 물소센터(PCC)
--
-- 가드: 현재 좌표가 목표에서 0.2°(~22km) 이상 벗어난 경우에만 보정.
-- (이후 목장 정보 창에서 미세조정한 좌표는 매 배포 시 재실행되어도 덮어쓰지 않음)

-- 송영신목장 — 경기도 안성시 미양면 갈전리 286-8
-- 좌표는 갈전리 마을 기준 근사값. 필지 단위 정밀 좌표는 목장 정보 창의
-- "주소로 좌표 찾기"(Kakao 지오코딩) 또는 지도 클릭으로 확정한다.
UPDATE farms
SET lat = 36.9689,
    lng = 127.2439,
    address = '경기도 안성시 미양면 갈전리 286-8',
    updated_at = NOW()
WHERE name LIKE '%송영신%'
  AND (lat IS NULL OR abs(lat - 36.9689) > 0.2 OR abs(lng - 127.2439) > 0.2);

-- 필리핀 물소센터 — Philippine Carabao Center National HQ & Gene Pool
-- Science City of Muñoz, Nueva Ecija 3120 (CLSU 캠퍼스 내, 40ha 부지)
-- 좌표는 CLSU 캠퍼스(15°43'58"N 120°55'52"E) 기준.
UPDATE farms
SET lat = 15.7399,
    lng = 120.9310,
    address = 'Science City of Muñoz, Nueva Ecija, Philippines 3120',
    updated_at = NOW()
WHERE (name ILIKE '%carabao%' OR name ILIKE '%PCC%' OR name LIKE '%물소%' OR name ILIKE '%buffalo%')
  AND (lat IS NULL OR abs(lat - 15.7399) > 0.2 OR abs(lng - 120.9310) > 0.2);
