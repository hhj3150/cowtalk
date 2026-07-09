import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WeatherConnector,
  calculateTHI,
  latLngToKmaGrid,
  kmaBaseDateTime,
  parseKmaObservation,
} from '../weather.connector.js';

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

function kmaSuccessResponse(items: Array<{ category: string; obsrValue: string }>): Response {
  return {
    ok: true,
    json: () => Promise.resolve({
      response: { header: { resultCode: '00' }, body: { items: { item: items } } },
    }),
  } as unknown as Response;
}

describe('latLngToKmaGrid', () => {
  it('서울시청 좌표 → 격자 (60, 127)', () => {
    expect(latLngToKmaGrid(37.5665, 126.978)).toEqual({ nx: 60, ny: 127 });
  });

  it('부산시청 좌표 → 격자 (98, 76)', () => {
    expect(latLngToKmaGrid(35.1796, 129.0756)).toEqual({ nx: 98, ny: 76 });
  });
});

describe('kmaBaseDateTime', () => {
  it('KST 45분 이후는 현재 시각 정시', () => {
    // 03:50 UTC = 12:50 KST
    expect(kmaBaseDateTime(new Date('2026-07-09T03:50:00Z')))
      .toEqual({ baseDate: '20260709', baseTime: '1200' });
  });

  it('KST 45분 이전은 직전 시각 (실황 공개 지연 반영)', () => {
    // 03:10 UTC = 12:10 KST → 11시 실황
    expect(kmaBaseDateTime(new Date('2026-07-09T03:10:00Z')))
      .toEqual({ baseDate: '20260709', baseTime: '1100' });
  });

  it('KST 자정 직후는 전날 23시로 롤오버', () => {
    // 15:10 UTC = 익일 00:10 KST → 전날 23시 실황
    expect(kmaBaseDateTime(new Date('2026-07-09T15:10:00Z')))
      .toEqual({ baseDate: '20260709', baseTime: '2300' });
  });
});

describe('parseKmaObservation', () => {
  it('T1H/REH/WSD/RN1을 관측값으로 변환', () => {
    const obs = parseKmaObservation([
      { category: 'T1H', obsrValue: '27.3' },
      { category: 'REH', obsrValue: '78' },
      { category: 'WSD', obsrValue: '2.1' },
      { category: 'RN1', obsrValue: '0' },
    ]);
    expect(obs).toEqual({ temperature: 27.3, humidity: 78, windSpeed: 2.1, precipitation: 0 });
  });

  it('필수 지표(기온·습도) 누락 시 null — 부분 데이터로 THI를 만들지 않는다', () => {
    expect(parseKmaObservation([{ category: 'WSD', obsrValue: '2.1' }])).toBeNull();
    expect(parseKmaObservation([{ category: 'T1H', obsrValue: '27.3' }])).toBeNull();
    expect(parseKmaObservation([])).toBeNull();
  });

  it('숫자가 아닌 값은 무시하되 필수 지표면 null', () => {
    expect(parseKmaObservation([
      { category: 'T1H', obsrValue: '점검중' },
      { category: 'REH', obsrValue: '78' },
    ])).toBeNull();
  });
});

describe('WeatherConnector', () => {
  let connector: WeatherConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new WeatherConnector();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('connect()', () => {
    it('API 키가 있으면 connected 상태', async () => {
      await connector.connect();
      expect(connector.getStatus()).toBe('connected');
    });
  });

  describe('fetchCurrentWeather() — KMA 실황 성공', () => {
    it('실황 응답을 source=kma 레코드로 반환', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(kmaSuccessResponse([
        { category: 'T1H', obsrValue: '27.3' },
        { category: 'REH', obsrValue: '78' },
        { category: 'WSD', obsrValue: '2.1' },
        { category: 'RN1', obsrValue: '0' },
      ])));

      const weather = await connector.fetchCurrentWeather(37.5665, 126.978);
      expect(weather).not.toBeNull();
      expect(weather!.source).toBe('kma');
      expect(weather!.stationId).toBe('kma-60-127');
      expect(weather!.temperature).toBe(27.3);
      expect(weather!.humidity).toBe(78);
      expect(weather!.thi).toBeCloseTo(calculateTHI(27.3, 78), 0);
    });

    it('같은 격자는 10분 캐시 — 2회째 호출에 API를 다시 부르지 않는다', async () => {
      const fetchMock = vi.fn().mockResolvedValue(kmaSuccessResponse([
        { category: 'T1H', obsrValue: '20' },
        { category: 'REH', obsrValue: '60' },
      ]));
      vi.stubGlobal('fetch', fetchMock);

      await connector.fetchCurrentWeather(37.5665, 126.978);
      await connector.fetchCurrentWeather(37.5665, 126.978);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchCurrentWeather() — 폴백 (실황 불가)', () => {
    beforeEach(() => {
      // 네트워크 불가 상황 시뮬레이션 — 추정 폴백 경로 검증
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    });

    it('추정 레코드는 source=estimate로 명시 구분', async () => {
      await connector.connect();
      const weather = await connector.fetchCurrentWeather(37.5, 127.0);

      expect(weather).not.toBeNull();
      expect(weather!.source).toBe('estimate');
      expect(weather!.stationId).toContain('est-');
      expect(weather!.stationName).toBe('추정관측');
      expect(weather!.temperature).toBeTypeOf('number');
      expect(weather!.humidity).toBeTypeOf('number');
      expect(weather!.observationTime).toBeTruthy();
    });

    it('온도가 계절적 범위 내', async () => {
      const weather = await connector.fetchCurrentWeather(37.5, 127.0);
      expect(weather!.temperature).toBeGreaterThanOrEqual(-15);
      expect(weather!.temperature).toBeLessThanOrEqual(40);
    });

    it('습도가 0~100 범위', async () => {
      const weather = await connector.fetchCurrentWeather(37.5, 127.0);
      expect(weather!.humidity).toBeGreaterThanOrEqual(0);
      expect(weather!.humidity).toBeLessThanOrEqual(100);
    });

    it('THI가 온도와 습도 기반으로 계산됨', async () => {
      const weather = await connector.fetchCurrentWeather(37.5, 127.0);
      const expectedThi = calculateTHI(weather!.temperature, weather!.humidity);
      expect(weather!.thi).toBeCloseTo(expectedThi, 0);
    });

    it('실패 쿨다운 — 연속 호출에 API를 재시도하지 않는다', async () => {
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      await connector.fetchCurrentWeather(37.5, 127.0);
      await connector.fetchCurrentWeather(37.5, 127.0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
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
      expect(WeatherConnector.thiLevel(72).level).toBe('warning');
    });

    it('경계값 THI 78 → danger', () => {
      expect(WeatherConnector.thiLevel(78).level).toBe('danger');
    });

    it('경계값 THI 84 → emergency', () => {
      expect(WeatherConnector.thiLevel(84).level).toBe('emergency');
    });
  });
});
