// 지리적 유틸리티 — Haversine 거리 계산 + 근접 농장 탐색

import type { Coordinates } from '@cowtalk/shared';

const EARTH_RADIUS_KM = 6371;

/**
 * 두 좌표 간 Haversine 거리 (km)
 *
 * 지구를 구로 가정하고 두 위경도 좌표 사이의 대원거리를 계산한다.
 * 146개 농장 규모에서 O(n^2) 계산도 충분히 빠르다.
 */
export function haversineDistance(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export interface FarmWithCoordinates {
  readonly farmId: string;
  readonly farmName: string;
  readonly coordinates: Coordinates;
}

export interface FarmWithDistance extends FarmWithCoordinates {
  readonly distanceKm: number;
}

/**
 * 기준 농장으로부터 반경 내 농장 목록을 반환한다.
 */
export function findFarmsWithinRadius(
  center: Coordinates,
  farms: readonly FarmWithCoordinates[],
  radiusKm: number,
): readonly FarmWithDistance[] {
  return farms
    .map((farm) => ({
      ...farm,
      distanceKm: haversineDistance(center, farm.coordinates),
    }))
    .filter((farm) => farm.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * 농장 집합의 지리적 중심점을 계산한다.
 */
export function calculateClusterCenter(
  farms: readonly FarmWithCoordinates[],
): Coordinates {
  if (farms.length === 0) {
    return { lat: 0, lng: 0 };
  }

  const sum = farms.reduce(
    (acc, farm) => ({
      lat: acc.lat + farm.coordinates.lat,
      lng: acc.lng + farm.coordinates.lng,
    }),
    { lat: 0, lng: 0 },
  );

  return {
    lat: sum.lat / farms.length,
    lng: sum.lng / farms.length,
  };
}

/**
 * 중심점에서 가장 먼 농장까지의 거리 (클러스터 반경)
 */
export function calculateClusterRadius(
  center: Coordinates,
  farms: readonly FarmWithCoordinates[],
): number {
  if (farms.length === 0) return 0;

  return Math.max(
    ...farms.map((farm) => haversineDistance(center, farm.coordinates)),
  );
}
