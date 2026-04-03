import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WeatherConnector, calculateTHI } from '../weather.connector.js';

vi.mock('../../../../config/index.js', () => ({
  config: { PUBLIC_DATA_API_KEY: 'test-key-for-unit-test' },
}));

vi.mock('../../../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('WeatherConnector', () => {
  let connector: WeatherConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new WeatherConnector();
  });

  describe('connect()', () => {
    it('API 키가 있으면 connected 상태', async () => {
      await connector.connect();
      expect(connector.getStatus()).toBe('connected');
    });
  });

  describe('fetchCurrentWeather()', () => {
    it('유효한 좌표로 기상 데이터 반환', async () => {
      await connector.connect();
      const weather = await connector.fetchCurrentWeather(37.5, 127.0);

      expect(weather).not.toBeNull();
      expect(weather!.temperature).toBeTypeOf('number');
      expect(weather!.humidity).toBeTypeOf('number');
      expect(weather!.thi).toBeTypeOf('number');
      expect(weather!.observationTime).toBeTruthy();
      expect(weather!.stationId).toContain('est-');
    });

    it('온도가 계절적 범위 내', async () => {
      await connector.connect();
      const weather = await connector.fetchCurrentWeather(37.5, 127.0);

      expect(weather).not.toBeNull();
      expect(weather!.temperature).toBeGreaterThanOrEqual(-15);
      expect(weather!.temperature).toBeLessThanOrEqual(40);
    });

    it('습도가 0~100 범위', async () => {
      await connector.connect();
      const weather = await connector.fetchCurrentWeather(37.5, 127.0);

      expect(weather).not.toBeNull();
      expect(weather!.humidity).toBeGreaterThanOrEqual(0);
      expect(weather!.humidity).toBeLessThanOrEqual(100);
    });

    it('THI가 온도와 습도 기반으로 계산됨', async () => {
      await connector.connect();
      const weather = await connector.fetchCurrentWeather(37.5, 127.0);

      expect(weather).not.toBeNull();
      const expectedThi = calculateTHI(weather!.temperature, weather!.humidity);
      expect(weather!.thi).toBeCloseTo(expectedThi, 0);
    });

    it('API 키 없으면 null 반환', async () => {
      const { config: mockConfig } = await import('../../../../config/index.js');
      const original = mockConfig.PUBLIC_DATA_API_KEY;
      (mockConfig as Record<string, unknown>).PUBLIC_DATA_API_KEY = '';

      const result = await connector.fetchCurrentWeather(37.5, 127.0);
      expect(result).toBeNull();

      (mockConfig as Record<string, unknown>).PUBLIC_DATA_API_KEY = original;
    });
  });

  describe('thiLevel()', () => {
    it('THI < 72 → normal', () => {
      const result = WeatherConnector.thiLevel(65);
      expect(result.level).toBe('normal');
      expect(result.label).toBe('정상');
    });

    it('THI 72~77 → warning', () => {
      const result = WeatherConnector.thiLevel(74);
      expect(result.level).toBe('warning');
      expect(result.label).toBe('주의');
    });

    it('THI 78~83 → danger', () => {
      const result = WeatherConnector.thiLevel(80);
      expect(result.level).toBe('danger');
      expect(result.label).toBe('위험');
    });

    it('THI ≥ 84 → emergency', () => {
      const result = WeatherConnector.thiLevel(88);
      expect(result.level).toBe('emergency');
      expect(result.label).toBe('긴급');
    });

    it('경계값 THI 72 → warning', () => {
      const result = WeatherConnector.thiLevel(72);
      expect(result.level).toBe('warning');
    });

    it('경계값 THI 78 → danger', () => {
      const result = WeatherConnector.thiLevel(78);
      expect(result.level).toBe('danger');
    });

    it('경계값 THI 84 → emergency', () => {
      const result = WeatherConnector.thiLevel(84);
      expect(result.level).toBe('emergency');
    });
  });
});
