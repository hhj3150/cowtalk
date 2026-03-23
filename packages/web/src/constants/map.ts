// 지도 타일 프로바이더 설정
// CartoDB (CARTO) — 상용 무료, OSM 기반, 안정적
// OSM 직접 타일은 상용 앱에서 Rate limit / 503 발생 가능

export const TILE_URL =
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>';
