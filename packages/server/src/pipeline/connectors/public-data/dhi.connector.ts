// DHI(젖소검정성적) 커넥터 — 유량, 유지방, 유단백, 체세포수

import { AbstractConnector } from '../base.connector.js';
import type { ConnectorConfig, FetchResult } from '../base.connector.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../lib/logger.js';

export interface DHIRecord {
  readonly testDate: string;
  readonly farmId: string;
  readonly animalId: string;
  readonly earTag: string;
  readonly milkYield: number;       // 유량 (kg)
  readonly fatPercentage: number;    // 유지방 (%)
  readonly proteinPercentage: number; // 유단백 (%)
  readonly scc: number;              // 체세포수 (천/ml)
  readonly lactationDays: number;    // 비유일수
  readonly parity: number;
}

export const DHI_CONFIG: ConnectorConfig = {
  id: 'dhi',
  name: '젖소검정성적(DHI)',
  enabled: true,
  syncIntervalMs: 24 * 60 * 60 * 1000,
  retryCount: 3,
  retryDelayMs: 5000,
};

export class DHIConnector extends AbstractConnector<DHIRecord> {
  constructor(connectorConfig: ConnectorConfig = DHI_CONFIG) {
    super(connectorConfig);
  }

  async connect(): Promise<void> {
    const apiKey = config.PUBLIC_DATA_API_KEY;
    if (!apiKey) {
      logger.warn('[DHI] No API key — connector disabled');
      this.status = 'disconnected';
      return;
    }
    this.status = 'connected';
    logger.info('[DHI] Ready');
  }

  async fetch(since?: Date): Promise<FetchResult<DHIRecord>> {
    return this.fetchWithRetry(async () => {
      logger.info({ since }, '[DHI] Fetching records');
      return { data: [], count: 0, fetchedAt: new Date(), hasMore: false };
    });
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
  }
}
