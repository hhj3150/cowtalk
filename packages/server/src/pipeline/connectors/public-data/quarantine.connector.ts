// 가축방역정보 커넥터 — 질병발생, 방역이력

import { AbstractConnector } from '../base.connector.js';
import type { ConnectorConfig, FetchResult } from '../base.connector.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../lib/logger.js';

export interface QuarantineRecord {
  readonly reportId: string;
  readonly diseaseType: string;
  readonly reportDate: string;
  readonly location: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly animalCount: number;
  readonly status: 'reported' | 'confirmed' | 'resolved';
  readonly quarantineMeasures: string | null;
}

export const QUARANTINE_CONFIG: ConnectorConfig = {
  id: 'quarantine',
  name: '가축방역정보',
  enabled: true,
  syncIntervalMs: 6 * 60 * 60 * 1000, // 6시간
  retryCount: 3,
  retryDelayMs: 5000,
};

export class QuarantineConnector extends AbstractConnector<QuarantineRecord> {
  constructor(connectorConfig: ConnectorConfig = QUARANTINE_CONFIG) {
    super(connectorConfig);
  }

  async connect(): Promise<void> {
    const apiKey = config.PUBLIC_DATA_API_KEY;
    if (!apiKey) {
      logger.warn('[Quarantine] No API key — connector disabled');
      this.status = 'disconnected';
      return;
    }
    this.status = 'connected';
    logger.info('[Quarantine] Ready');
  }

  async fetch(since?: Date): Promise<FetchResult<QuarantineRecord>> {
    return this.fetchWithRetry(async () => {
      logger.info({ since }, '[Quarantine] Fetching records');
      return { data: [], count: 0, fetchedAt: new Date(), hasMore: false };
    });
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
  }
}
