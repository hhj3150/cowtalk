import { describe, it, expect } from 'vitest';
import {
  haversineDistance,
  findFarmsWithinRadius,
  calculateClusterCenter,
  calculateClusterRadius,
} from '../geo-utils.js';

describe('geo-utils', () => {
  // 서울 → 부산 약 325km
  const seoul = { lat: 37.5665, lng: 126.978 };
  const busan = { lat: 35.1796, lng: 129.0756 };

  // 가까운 농장들 (충남 지역)
  const farm1 = { farmId: 'f1', farmName: '농장1', coordinates: { lat: 36.5, lng: 127.0 } };
  const farm2 = { farmId: 'f2', farmName: '농장2', coordinates: { lat: 36.52, lng: 127.02 } };
  const farm3 = { farmId: 'f3', farmName: '농장3', coordinates: { lat: 36.48, lng: 126.98 } };
  const farmFar = { farmId: 'f4', farmName: '먼농장', coordinates: { lat: 35.0, lng: 128.5 } };

  describe('haversineDistance', () => {
    it('서울-부산 거리 약 325km', () => {
      const dist = haversineDistance(seoul, busan);
      expect(dist).toBeGreaterThan(300);
      expect(dist).toBeLessThan(350);
    });

    it('같은 좌표는 거리 0', () => {
      expect(haversineDistance(seoul, seoul)).toBe(0);
    });

    it('가까운 농장 간 거리 < 5km', () => {
      const dist = haversineDistance(farm1.coordinates, farm2.coordinates);
      expect(dist).toBeLessThan(5);
    });
  });

  describe('findFarmsWithinRadius', () => {
    const allFarms = [farm1, farm2, farm3, farmFar];

    it('30km 반경 내 가까운 농장 3개 반환', () => {
      const result = findFarmsWithinRadius(farm1.coordinates, allFarms, 30);
      expect(result.length).toBe(3); // farm1 자신 포함
      expect(result.map((f) => f.farmId)).toContain('f1');
      expect(result.map((f) => f.farmId)).toContain('f2');
      expect(result.map((f) => f.farmId)).toContain('f3');
    });

    it('먼 농장은 제외', () => {
      const result = findFarmsWithinRadius(farm1.coordinates, allFarms, 30);
      expect(result.map((f) => f.farmId)).not.toContain('f4');
    });

    it('거리순 정렬', () => {
      const result = findFarmsWithinRadius(farm1.coordinates, allFarms, 30);
      for (let i = 1; i < result.length; i++) {
        expect(result[i]!.distanceKm).toBeGreaterThanOrEqual(result[i - 1]!.distanceKm);
      }
    });
  });

  describe('calculateClusterCenter', () => {
    it('중심점 계산', () => {
      const center = calculateClusterCenter([farm1, farm2, farm3]);
      // 3개 농장의 평균 좌표
      expect(center.lat).toBeCloseTo((36.5 + 36.52 + 36.48) / 3, 2);
      expect(center.lng).toBeCloseTo((127.0 + 127.02 + 126.98) / 3, 2);
    });

    it('빈 배열은 (0, 0)', () => {
      const center = calculateClusterCenter([]);
      expect(center.lat).toBe(0);
      expect(center.lng).toBe(0);
    });
  });

  describe('calculateClusterRadius', () => {
    it('반경 > 0', () => {
      const center = calculateClusterCenter([farm1, farm2, farm3]);
      const radius = calculateClusterRadius(center, [farm1, farm2, farm3]);
      expect(radius).toBeGreaterThan(0);
      expect(radius).toBeLessThan(10); // 가까운 농장들이므로 10km 미만
    });

    it('빈 배열은 반경 0', () => {
      expect(calculateClusterRadius({ lat: 0, lng: 0 }, [])).toBe(0);
    });
  });
});
