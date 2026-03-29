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
