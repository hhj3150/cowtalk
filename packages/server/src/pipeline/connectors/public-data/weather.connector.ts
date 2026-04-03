// 기상청 기상데이터 커넥터 — 기온, 습도, THI

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
}

/** THI (온습도지수) 계산 — 축산 열스트레스 지표 */
export function calculateTHI(tempC: number, humidityPct: number): number {
  // NRC 1971 공식
  return (1.8 * tempC + 32) - (0.55 - 0.0055 * humidityPct) * (1.8 * tempC - 26);
}

export const WEATHER_CONFIG: ConnectorConfig = {
  id: 'weather',
  name: '기상청 기상데이터',
  enabled: true,
  syncIntervalMs: 60 * 60 * 1000, // 1시간
  retryCount: 3,
  retryDelayMs: 3000,
};

export class WeatherConnector extends AbstractConnector<WeatherRecord> {
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
    logger.info('[Weather] Ready');
  }

  /** 현재 기상 데이터 조회 (목장 좌표 기반) */
  async fetchCurrentWeather(lat: number, lng: number): Promise<WeatherRecord | null> {
    if (!config.PUBLIC_DATA_API_KEY) return null;

    // TODO: 실 기상청 API 연동 (data.kma.go.kr)
    // 현재는 계절·시간 기반 추정값 제공 (구조는 실 API 교체 가능)
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
