// 한국 17개 시도 경계 GeoJSON (simplified)
// 시연용 근사 경계 — zoom 7~8에서 시각적으로 충분
// 실제 정밀 경계는 국토지리정보원 데이터로 교체 가능

export interface ProvinceProperties {
  readonly code: string;
  readonly name: string;
  readonly nameEn: string;
}

export const KOREA_PROVINCES: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    // 서울특별시
    {
      type: 'Feature',
      properties: { code: '11', name: '서울특별시', nameEn: 'Seoul' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[126.76, 37.43], [126.76, 37.70], [127.18, 37.70], [127.18, 37.43], [126.76, 37.43]]],
      },
    },
    // 부산광역시
    {
      type: 'Feature',
      properties: { code: '26', name: '부산광역시', nameEn: 'Busan' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[128.85, 35.05], [128.85, 35.28], [129.23, 35.28], [129.23, 35.05], [128.85, 35.05]]],
      },
    },
    // 대구광역시
    {
      type: 'Feature',
      properties: { code: '27', name: '대구광역시', nameEn: 'Daegu' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[128.35, 35.75], [128.35, 36.05], [128.80, 36.05], [128.80, 35.75], [128.35, 35.75]]],
      },
    },
    // 인천광역시
    {
      type: 'Feature',
      properties: { code: '28', name: '인천광역시', nameEn: 'Incheon' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[126.35, 37.35], [126.35, 37.62], [126.78, 37.62], [126.78, 37.35], [126.35, 37.35]]],
      },
    },
    // 광주광역시
    {
      type: 'Feature',
      properties: { code: '29', name: '광주광역시', nameEn: 'Gwangju' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[126.72, 35.08], [126.72, 35.22], [126.98, 35.22], [126.98, 35.08], [126.72, 35.08]]],
      },
    },
    // 대전광역시
    {
      type: 'Feature',
      properties: { code: '30', name: '대전광역시', nameEn: 'Daejeon' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[127.25, 36.20], [127.25, 36.50], [127.55, 36.50], [127.55, 36.20], [127.25, 36.20]]],
      },
    },
    // 울산광역시
    {
      type: 'Feature',
      properties: { code: '31', name: '울산광역시', nameEn: 'Ulsan' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[129.05, 35.40], [129.05, 35.72], [129.45, 35.72], [129.45, 35.40], [129.05, 35.40]]],
      },
    },
    // 세종특별자치시
    {
      type: 'Feature',
      properties: { code: '36', name: '세종특별자치시', nameEn: 'Sejong' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[126.88, 36.44], [126.88, 36.62], [127.10, 36.62], [127.10, 36.44], [126.88, 36.44]]],
      },
    },
    // 경기도
    {
      type: 'Feature',
      properties: { code: '41', name: '경기도', nameEn: 'Gyeonggi' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[126.38, 36.90], [126.60, 37.85], [126.90, 37.95], [127.60, 37.95], [127.85, 37.50], [127.55, 37.05], [127.10, 36.90], [126.38, 36.90]]],
      },
    },
    // 강원특별자치도
    {
      type: 'Feature',
      properties: { code: '42', name: '강원특별자치도', nameEn: 'Gangwon' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[127.55, 37.05], [127.85, 37.50], [127.90, 37.95], [128.95, 38.60], [129.35, 37.90], [129.20, 37.15], [128.50, 37.00], [127.55, 37.05]]],
      },
    },
    // 충청북도
    {
      type: 'Feature',
      properties: { code: '43', name: '충청북도', nameEn: 'Chungbuk' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[127.10, 36.40], [127.10, 36.90], [127.55, 37.05], [128.50, 37.00], [128.20, 36.40], [127.55, 36.20], [127.10, 36.40]]],
      },
    },
    // 충청남도
    {
      type: 'Feature',
      properties: { code: '44', name: '충청남도', nameEn: 'Chungnam' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[125.95, 36.10], [126.00, 36.85], [126.38, 36.90], [127.10, 36.90], [127.10, 36.40], [127.55, 36.20], [127.25, 36.00], [126.60, 35.95], [125.95, 36.10]]],
      },
    },
    // 전북특별자치도
    {
      type: 'Feature',
      properties: { code: '45', name: '전북특별자치도', nameEn: 'Jeonbuk' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[126.30, 35.55], [126.30, 35.95], [126.60, 35.95], [127.25, 36.00], [127.55, 36.20], [127.90, 35.75], [127.40, 35.55], [126.30, 35.55]]],
      },
    },
    // 전라남도
    {
      type: 'Feature',
      properties: { code: '46', name: '전라남도', nameEn: 'Jeonnam' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[125.90, 34.20], [125.95, 34.95], [126.30, 35.55], [127.40, 35.55], [127.90, 35.10], [127.60, 34.55], [126.85, 34.20], [125.90, 34.20]]],
      },
    },
    // 경상북도
    {
      type: 'Feature',
      properties: { code: '47', name: '경상북도', nameEn: 'Gyeongbuk' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[128.20, 36.40], [128.50, 37.00], [129.20, 37.15], [129.55, 36.40], [129.50, 35.95], [129.05, 35.72], [128.80, 35.75], [128.35, 36.05], [128.20, 36.40]]],
      },
    },
    // 경상남도
    {
      type: 'Feature',
      properties: { code: '48', name: '경상남도', nameEn: 'Gyeongnam' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[127.60, 34.55], [127.90, 35.10], [127.90, 35.75], [128.35, 35.75], [128.85, 35.28], [129.05, 35.40], [129.05, 34.95], [128.30, 34.80], [127.60, 34.55]]],
      },
    },
    // 제주특별자치도
    {
      type: 'Feature',
      properties: { code: '50', name: '제주특별자치도', nameEn: 'Jeju' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[126.15, 33.15], [126.15, 33.55], [126.95, 33.55], [126.95, 33.15], [126.15, 33.15]]],
      },
    },
  ],
};

// 시도 중심 좌표 (팝업/라벨 표시용)
export const PROVINCE_CENTERS: Readonly<Record<string, [number, number]>> = {
  '11': [37.57, 126.98],  // 서울
  '26': [35.18, 129.08],  // 부산
  '27': [35.87, 128.60],  // 대구
  '28': [37.46, 126.71],  // 인천
  '29': [35.16, 126.85],  // 광주
  '30': [36.35, 127.38],  // 대전
  '31': [35.54, 129.31],  // 울산
  '36': [36.48, 127.00],  // 세종
  '41': [37.41, 127.52],  // 경기
  '42': [37.83, 128.73],  // 강원
  '43': [36.64, 127.49],  // 충북
  '44': [36.52, 126.80],  // 충남
  '45': [35.82, 127.11],  // 전북
  '46': [34.87, 126.99],  // 전남
  '47': [36.57, 128.73],  // 경북
  '48': [35.24, 128.69],  // 경남
  '50': [33.36, 126.53],  // 제주
};
