// 위경도 → 한국 시도 자동 매핑
// regionId가 없는 농장(smaXtec 동기화 농장)의 시도 판별에 사용
// 한국 시도별 대략적 경계 박스 기반

interface ProvinceBounds {
  readonly province: string;
  readonly latMin: number;
  readonly latMax: number;
  readonly lngMin: number;
  readonly lngMax: number;
}

// 시도별 대략적 경계 (남→북 순서로 우선순위 정렬)
const PROVINCE_BOUNDS: readonly ProvinceBounds[] = [
  { province: '제주특별자치도',     latMin: 33.0, latMax: 33.7, lngMin: 126.0, lngMax: 127.0 },
  { province: '전라남도',          latMin: 34.0, latMax: 35.5, lngMin: 125.9, lngMax: 127.5 },
  { province: '경상남도',          latMin: 34.5, latMax: 35.9, lngMin: 127.5, lngMax: 129.5 },
  { province: '전라북도',          latMin: 35.3, latMax: 36.2, lngMin: 126.3, lngMax: 127.9 },
  { province: '충청남도',          latMin: 36.0, latMax: 37.0, lngMin: 125.9, lngMax: 127.3 },
  { province: '충청북도',          latMin: 36.4, latMax: 37.2, lngMin: 127.2, lngMax: 128.2 },
  { province: '경상북도',          latMin: 35.6, latMax: 37.2, lngMin: 128.2, lngMax: 130.0 },
  { province: '경기도',            latMin: 36.9, latMax: 38.3, lngMin: 126.3, lngMax: 127.9 },
  { province: '강원특별자치도',     latMin: 37.0, latMax: 38.7, lngMin: 127.5, lngMax: 129.5 },
];

// 시도 중심 좌표 (지도 표시용)
export const PROVINCE_CENTERS: Readonly<Record<string, { lat: number; lng: number }>> = {
  '경기도':            { lat: 37.41, lng: 127.52 },
  '강원특별자치도':     { lat: 37.88, lng: 128.21 },
  '충청북도':          { lat: 36.63, lng: 127.49 },
  '충청남도':          { lat: 36.51, lng: 126.80 },
  '전라북도':          { lat: 35.82, lng: 127.15 },
  '전라남도':          { lat: 34.82, lng: 126.46 },
  '경상북도':          { lat: 36.49, lng: 128.89 },
  '경상남도':          { lat: 35.46, lng: 128.21 },
  '제주특별자치도':     { lat: 33.49, lng: 126.53 },
};

// ─────────────────────────────────────────────────────────
// 주소(시·군명) → 시도 매핑 — 권위 데이터(좌표 추측보다 우선)
//
// smaXtec 농장은 regionId가 '전국' placeholder라 좌표 추측에 의존했는데,
// 경계 박스 겹침(경기 남부 평택·안성·이천이 충남/충북에 흡수)으로 카운트가
// 어긋났다. farm.address 에는 smaXtec org 이름의 괄호 안 지역명(예: "포천",
// "평택", "칠곡 이현우")이 들어 있어, 시·군명으로 시도를 결정론적으로 판별하면
// smaXtec 자체 그룹핑과 일치한다.
//
// ⚠️ 동일 지명(광주=경기/광역시, 고성=강원/경남)은 매핑에서 제외 → 좌표 fallback이
//    판단(새 오류를 만들지 않는다).
// ─────────────────────────────────────────────────────────
const PROVINCE_CITIES: Readonly<Record<string, readonly string[]>> = {
  '경기도': ['수원', '성남', '의정부', '안양', '부천', '광명', '평택', '동두천', '안산',
    '고양', '과천', '구리', '남양주', '오산', '시흥', '군포', '의왕', '하남', '용인', '파주',
    '이천', '안성', '김포', '화성', '양주', '포천', '여주', '연천', '가평', '양평', '인천'],
  '강원특별자치도': ['춘천', '원주', '강릉', '동해', '태백', '속초', '삼척', '홍천', '횡성',
    '영월', '평창', '정선', '철원', '화천', '양구', '인제', '양양'],
  '충청북도': ['청주', '충주', '제천', '보은', '옥천', '영동', '증평', '진천', '괴산', '음성', '단양'],
  '충청남도': ['천안', '공주', '보령', '아산', '서산', '논산', '계룡', '당진', '금산', '부여',
    '서천', '청양', '홍성', '예산', '태안', '세종', '대전'],
  '전라북도': ['전주', '군산', '익산', '정읍', '남원', '김제', '완주', '진안', '무주', '장수',
    '임실', '순창', '고창', '부안'],
  '전라남도': ['목포', '여수', '순천', '나주', '광양', '담양', '곡성', '구례', '고흥', '보성',
    '화순', '장흥', '강진', '해남', '영암', '무안', '함평', '영광', '장성', '완도', '진도', '신안'],
  '경상북도': ['포항', '경주', '김천', '안동', '구미', '영주', '영천', '상주', '문경', '경산',
    '군위', '의성', '청송', '영양', '영덕', '청도', '고령', '성주', '칠곡', '예천', '봉화',
    '울진', '울릉', '대구'],
  '경상남도': ['창원', '진주', '통영', '사천', '김해', '밀양', '거제', '양산', '의령', '함안',
    '창녕', '남해', '하동', '산청', '함양', '거창', '합천', '울산', '부산'],
  '제주특별자치도': ['제주', '서귀포'],
};

// 긴 지명 우선 매칭 (예: "남양주"가 "양주"보다 먼저) — 부분일치 오판 방지.
const CITY_TO_PROVINCE: ReadonlyArray<readonly [string, string]> = Object.entries(PROVINCE_CITIES)
  .flatMap(([province, cities]) => cities.map((c) => [c, province] as const))
  .sort((a, b) => b[0].length - a[0].length);

/**
 * 주소/시군명 문자열에서 시도 판별 (권위 데이터).
 * @returns 시도명 또는 null (인식 불가 → 호출부가 좌표 fallback)
 */
export function cityToProvince(addressOrCity: string | null | undefined): string | null {
  if (!addressOrCity) return null;
  const text = addressOrCity.trim();
  if (!text) return null;
  for (const [city, province] of CITY_TO_PROVINCE) {
    if (text.includes(city)) return province;
  }
  return null;
}

/**
 * 농장 시도 통합 판별 — 모든 집계/드릴다운이 공유하는 단일 권위 함수.
 * 우선순위: 유효 regionId 시도 > 주소 시·군명 > 좌표 추측.
 * 이 순서를 모든 소비자가 동일하게 따라야 카운트가 어긋나지 않는다.
 */
export function resolveFarmProvince(args: {
  regionProvince?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}): string {
  const { regionProvince, address, lat, lng } = args;
  if (regionProvince && regionProvince !== '전국' && PROVINCE_CENTERS[regionProvince]) {
    return regionProvince;
  }
  const byCity = cityToProvince(address);
  if (byCity) return byCity;
  return latLngToProvince(lat ?? null, lng ?? null);
}

/**
 * 위경도로 한국 시도 판별
 * @returns 시도명 또는 '해외' (한국 경계 밖)
 */
export function latLngToProvince(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return '미분류';

  // 한국 범위 밖이면 해외
  if (lat < 33.0 || lat > 39.0 || lng < 124.0 || lng > 132.0) {
    return '해외';
  }

  // 경계 박스 매칭 (겹치는 영역은 먼저 매칭된 것 우선)
  for (const bounds of PROVINCE_BOUNDS) {
    if (
      lat >= bounds.latMin &&
      lat <= bounds.latMax &&
      lng >= bounds.lngMin &&
      lng <= bounds.lngMax
    ) {
      return bounds.province;
    }
  }

  // 어디에도 매칭 안 되면 가장 가까운 시도 중심으로
  let closest = '경기도';
  let minDist = Infinity;
  for (const [province, center] of Object.entries(PROVINCE_CENTERS)) {
    const dist = Math.sqrt((lat - center.lat) ** 2 + (lng - center.lng) ** 2);
    if (dist < minDist) {
      minDist = dist;
      closest = province;
    }
  }

  return closest;
}
