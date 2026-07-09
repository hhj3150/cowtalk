// 기상청 기상데이터 커넥터 — 기온, 습도, THI
//
// 실연동: 기상청 단기예보 조회서비스의 초단기실황(getUltraSrtNcst, data.go.kr 15084084).
// PUBLIC_DATA_API_KEY(data.go.kr 공통키) 사용, 좌표→기상청 격자(nx/ny) 변환 후 조회.
// 정직성: 실황 조회 실패 시 계절 추정치로 폴백하되 source='estimate'로 반드시 구분한다.
// 소비자(팅커벨 query_weather, weather 라우트)는 source를 보고 실측/추정을 표시한다.

import { AbstractConnector } from '../base.connector.js';
import type { ConnectorConfig, FetchResult } from '../base.connector.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../lib/logger.js';

export interface WeatherRecord {
  readonly observationTime: string;
  readonly stationId: string;
  readonly stationName: string;
  readonly temperature: number;
  readonly humidity: number;
  readonly thi: number;              // Temperature-Humidity Index
  readonly windSpeed: number | null;
  readonly precipitation: number | null;
  /** kma = 기상청 실황 실측, estimate = 계절·시간 기반 추정 (실측 아님) */
  readonly source: 'kma' | 'estimate';
}

/** THI (온습도지수) 계산 — 축산 열스트레스 지표 */
export function calculateTHI(tempC: number, humidityPct: number): number {
  // NRC 1971 공식
  return (1.8 * tempC + 32) - (0.55 - 0.0055 * humidityPct) * (1.8 * tempC - 26);
}

// ── 기상청 격자 변환 (LCC — 기상청 공식 dfs_xy_conv) ──────────────

const RE = 6371.00877;   // 지구 반경 (km)
const GRID = 5.0;        // 격자 간격 (km)
const SLAT1 = 30.0;      // 표준 위도 1
const SLAT2 = 60.0;      // 표준 위도 2
const OLON = 126.0;      // 기준점 경도
const OLAT = 38.0;       // 기준점 위도
const XO = 43;           // 기준점 X (격자)
const YO = 136;          // 기준점 Y (격자)

/** 위경도 → 기상청 격자 좌표 (초단기실황 nx/ny) — 순수 함수 */
export function latLngToKmaGrid(lat: number, lng: number): { nx: number; ny: number } {
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

/**
 * 초단기실황 base_date/base_time 계산 — 순수 함수
 * 실황은 매시 정각 관측분이 약 40분 후 공개되므로 KST 45분 전에는 직전 시각을 쓴다.
 */
export function kmaBaseDateTime(now: Date): { baseDate: string; baseTime: string } {
  const KST_OFFSET_MS = 9 * 3_600_000;
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  if (kst.getUTCMinutes() < 45) {
    kst.setUTCHours(kst.getUTCHours() - 1);
  }
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  const h = String(kst.getUTCHours()).padStart(2, '0');
  return { baseDate: `${y}${m}${d}`, baseTime: `${h}00` };
}

export interface KmaObservationItem {
  readonly category: string;
  readonly obsrValue: string;
}

export interface KmaObservation {
  readonly temperature: number;
  readonly humidity: number;
  readonly windSpeed: number | null;
  readonly precipitation: number | null;
}

/** 초단기실황 응답 항목 → 관측값. 필수 지표(기온·습도) 누락 시 null — 순수 함수 */
export function parseKmaObservation(items: readonly KmaObservationItem[]): KmaObservation | null {
  const byCategory = new Map(items.map((it) => [it.category, Number(it.obsrValue)]));
  const temperature = byCategory.get('T1H');
  const humidity = byCategory.get('REH');
  if (temperature == null || humidity == null || !Number.isFinite(temperature) || !Number.isFinite(humidity)) {
    return null;
  }
  const windSpeed = byCategory.get('WSD');
  const precipitation = byCategory.get('RN1');
  return {
    temperature,
    humidity,
    windSpeed: windSpeed != null && Number.isFinite(windSpeed) ? windSpeed : null,
    precipitation: precipitation != null && Number.isFinite(precipitation) ? precipitation : null,
  };
}

export const WEATHER_CONFIG: ConnectorConfig = {
  id: 'weather',
  name: '기상청 기상데이터',
  enabled: true,
  syncIntervalMs: 60 * 60 * 1000, // 1시간
  retryCount: 3,
  retryDelayMs: 3000,
};

const KMA_ENDPOINT = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst';
const KMA_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 10 * 60 * 1000;      // 격자별 실황 캐시
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000; // 실패 후 재시도 유예 (추정 폴백 유지)

interface KmaResponseBody {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { items?: { item?: KmaObservationItem[] } };
  };
}

export class WeatherConnector extends AbstractConnector<WeatherRecord> {
  private readonly cache = new Map<string, { record: WeatherRecord; expiry: number }>();
  private readonly failedUntil = new Map<string, number>();

  constructor(connectorConfig: ConnectorConfig = WEATHER_CONFIG) {
    super(connectorConfig);
  }

  async connect(): Promise<void> {
    const apiKey = config.PUBLIC_DATA_API_KEY;
    if (!apiKey) {
      logger.warn('[Weather] No API key — connector disabled');
      this.status = 'disconnected';
      return;
    }
    this.status = 'connected';
    logger.info('[Weather] Ready (KMA 초단기실황)');
  }

  /** 현재 기상 데이터 조회 (목장 좌표 기반) — KMA 실황 우선, 실패 시 추정 폴백(source 구분) */
  async fetchCurrentWeather(lat: number, lng: number): Promise<WeatherRecord | null> {
    if (!config.PUBLIC_DATA_API_KEY) return null;

    const { nx, ny } = latLngToKmaGrid(lat, lng);
    const gridKey = `${nx},${ny}`;

    const cached = this.cache.get(gridKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.record;
    }

    const cooldown = this.failedUntil.get(gridKey);
    if (!cooldown || cooldown <= Date.now()) {
      const real = await this.fetchFromKma(nx, ny);
      if (real) {
        this.cache.set(gridKey, { record: real, expiry: Date.now() + CACHE_TTL_MS });
        this.failedUntil.delete(gridKey);
        return real;
      }
      this.failedUntil.set(gridKey, Date.now() + FAILURE_COOLDOWN_MS);
    }

    return this.estimateWeather(lat, lng);
  }

  private async fetchFromKma(nx: number, ny: number): Promise<WeatherRecord | null> {
    const apiKey = config.PUBLIC_DATA_API_KEY;
    if (!apiKey) return null;

    const { baseDate, baseTime } = kmaBaseDateTime(new Date());
    const params = new URLSearchParams({
      serviceKey: apiKey,
      pageNo: '1',
      numOfRows: '10',
      dataType: 'JSON',
      base_date: baseDate,
      base_time: baseTime,
      nx: String(nx),
      ny: String(ny),
    });

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => { controller.abort(); }, KMA_TIMEOUT_MS);
      const response = await fetch(`${KMA_ENDPOINT}?${params.toString()}`, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) {
        logger.warn({ status: response.status, nx, ny }, '[Weather] KMA HTTP 오류');
        return null;
      }
      const json = await response.json() as KmaResponseBody;
      const resultCode = json.response?.header?.resultCode;
      if (resultCode !== '00') {
        logger.warn({ resultCode, resultMsg: json.response?.header?.resultMsg, nx, ny }, '[Weather] KMA 응답 오류');
        return null;
      }
      const obs = parseKmaObservation(json.response?.body?.items?.item ?? []);
      if (!obs) {
        logger.warn({ nx, ny }, '[Weather] KMA 필수 지표(T1H/REH) 누락');
        return null;
      }
      const thi = calculateTHI(obs.temperature, obs.humidity);
      return {
        observationTime: new Date().toISOString(),
        stationId: `kma-${nx}-${ny}`,
        stationName: `기상청 격자(${nx},${ny})`,
        temperature: obs.temperature,
        humidity: obs.humidity,
        thi: Math.round(thi * 10) / 10,
        windSpeed: obs.windSpeed,
        precipitation: obs.precipitation,
        source: 'kma',
      };
    } catch (error) {
      logger.warn({ error: error instanceof Error ? error.message : String(error), nx, ny }, '[Weather] KMA 조회 실패 — 추정 폴백');
      return null;
    }
  }

  /** 계절·시간 기반 추정 — 실측 아님. source='estimate'로 반드시 구분 표기 */
  private estimateWeather(lat: number, lng: number): WeatherRecord {
    const now = new Date();
    const month = now.getMonth() + 1;
    const hour = now.getHours();

    // 월별 평균 기온 (한국 중부 기준)
    const monthlyAvgTemp = [
      -3, -1, 5, 12, 18, 23, 26, 27, 22, 15, 7, 0,
    ];
    const baseTemp = monthlyAvgTemp[month - 1] ?? 15;
    // 일교차 반영 (새벽 -4°C, 오후 +4°C)
    const hourOffset = Math.sin((hour - 6) * Math.PI / 12) * 4;
    const temperature = Math.round((baseTemp + hourOffset) * 10) / 10;

    // 월별 평균 습도
    const monthlyAvgHumidity = [
      55, 52, 50, 50, 55, 65, 78, 80, 68, 58, 55, 55,
    ];
    const humidity = monthlyAvgHumidity[month - 1] ?? 60;

    const thi = calculateTHI(temperature, humidity);

    return {
      observationTime: now.toISOString(),
      stationId: `est-${lat.toFixed(1)}-${lng.toFixed(1)}`,
      stationName: '추정관측',
      temperature,
      humidity,
      thi: Math.round(thi * 10) / 10,
      windSpeed: null,
      precipitation: null,
      source: 'estimate',
    };
  }

  /** THI 등급 판정 */
  static thiLevel(thi: number): { level: string; label: string; color: string } {
    if (thi >= 84) return { level: 'emergency', label: '긴급', color: 'red' };
    if (thi >= 78) return { level: 'danger', label: '위험', color: 'orange' };
    if (thi >= 72) return { level: 'warning', label: '주의', color: 'yellow' };
    return { level: 'normal', label: '정상', color: 'green' };
  }

  async fetch(since?: Date): Promise<FetchResult<WeatherRecord>> {
    return this.fetchWithRetry(async () => {
      logger.info({ since }, '[Weather] Fetching records');
      return { data: [], count: 0, fetchedAt: new Date(), hasMore: false };
    });
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
  }
}
