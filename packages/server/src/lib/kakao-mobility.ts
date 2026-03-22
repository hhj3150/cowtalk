// Kakao Mobility 길찾기 API 클라이언트
// 실제 도로거리 + 예상 주행시간을 반환한다.

import { haversineKm, estimateDriveMinutes } from './haversine.js';

// ── 타입 ──

export interface RouteDistance {
  readonly distanceKm: number;      // 도로거리 (km)
  readonly durationMinutes: number;  // 예상 주행시간 (분)
  readonly source: 'kakao' | 'haversine';
}

interface KakaoDirectionsResponse {
  readonly routes: readonly {
    readonly result_code: number;
    readonly summary: {
      readonly distance: number;  // 미터
      readonly duration: number;  // 초
    };
  }[];
}

// ── 설정 ──

const KAKAO_API_KEY = process.env.KAKAO_REST_API_KEY ?? '';
const DIRECTIONS_URL = 'https://apis-navi.kakaomobility.com/v1/directions';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간 (농장 간 도로거리는 거의 불변)
const REQUEST_TIMEOUT_MS = 3_000;

// ── 인메모리 캐시 (좌표쌍 → 거리) ──

interface CacheEntry {
  readonly data: RouteDistance;
  readonly expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 2_000;

function cacheKey(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): string {
  // 소수점 4자리로 반올림 (약 11m 정밀도, 캐시 히트율 향상)
  const round = (v: number) => Math.round(v * 10_000) / 10_000;
  return `${round(lat1)},${round(lng1)}->${round(lat2)},${round(lng2)}`;
}

function getFromCache(key: string): RouteDistance | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

function setToCache(key: string, data: RouteDistance): void {
  // LRU-like: 초과 시 가장 오래된 항목 제거
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value as string;
    cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Kakao API 호출 ──

async function fetchKakaoDirections(
  originLat: number, originLng: number,
  destLat: number, destLng: number,
): Promise<RouteDistance> {
  if (!KAKAO_API_KEY) {
    throw new Error('KAKAO_REST_API_KEY not configured');
  }

  // Kakao는 lng,lat 순서 (경도, 위도)
  const url = `${DIRECTIONS_URL}?origin=${originLng},${originLat}&destination=${destLng},${destLat}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `KakaoAK ${KAKAO_API_KEY}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Kakao API ${response.status}: ${response.statusText}`);
    }

    const body = (await response.json()) as KakaoDirectionsResponse;
    const route = body.routes[0];

    if (!route || route.result_code !== 0) {
      throw new Error(`Kakao route not found (code: ${route?.result_code})`);
    }

    return {
      distanceKm: Math.round(route.summary.distance / 100) / 10, // m → km (소수점 1자리)
      durationMinutes: Math.round(route.summary.duration / 60),   // 초 → 분
      source: 'kakao' as const,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── 공개 함수 ──

/**
 * 두 지점 간 도로거리를 반환한다.
 * 1) 캐시 확인
 * 2) Kakao Mobility API 호출
 * 3) 실패 시 Haversine fallback
 */
export async function getRouteDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): Promise<RouteDistance> {
  const key = cacheKey(lat1, lng1, lat2, lng2);

  // 1. 캐시 히트
  const cached = getFromCache(key);
  if (cached) return cached;

  // 2. Kakao API 호출
  try {
    const result = await fetchKakaoDirections(lat1, lng1, lat2, lng2);
    setToCache(key, result);
    return result;
  } catch {
    // 3. Haversine fallback
    const distKm = haversineKm(lat1, lng1, lat2, lng2);
    const fallback: RouteDistance = {
      distanceKm: Math.round(distKm * 10) / 10,
      durationMinutes: estimateDriveMinutes(distKm),
      source: 'haversine' as const,
    };
    setToCache(key, fallback);
    return fallback;
  }
}

/**
 * 정렬된 좌표 목록에 대해 연속 구간별 도로거리를 일괄 계산한다.
 * 병렬 호출로 API 지연을 최소화한다.
 *
 * @returns index i → (i-1)번째에서 i번째까지의 거리. [0]은 항상 { distanceKm: 0, ... }
 */
export async function batchRouteDistances(
  points: readonly { readonly lat: number; readonly lng: number }[],
): Promise<readonly RouteDistance[]> {
  if (points.length === 0) return [];

  const zero: RouteDistance = { distanceKm: 0, durationMinutes: 0, source: 'haversine' as const };

  if (points.length === 1) return [zero];

  // 연속 구간 쌍 생성 후 병렬 호출
  const pairs = points.slice(1).map((pt, i) => ({
    from: points[i]!,
    to: pt,
  }));

  const results = await Promise.all(
    pairs.map((p) => getRouteDistance(p.from.lat, p.from.lng, p.to.lat, p.to.lng)),
  );

  return [zero, ...results];
}
