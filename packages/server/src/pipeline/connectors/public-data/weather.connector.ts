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
