// 혈통정보 커넥터 — 아비, 어미, 혈통등록

import { AbstractConnector } from '../base.connector.js';
import type { ConnectorConfig, FetchResult } from '../base.connector.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../lib/logger.js';

export interface PedigreeRecord {
  readonly registrationNumber: string;
  readonly animalName: string | null;
  readonly breed: string;
  readonly birthDate: string;
  readonly sex: string;
  readonly sire: SireInfo | null;
  readonly dam: DamInfo | null;
}

export interface SireInfo {
  readonly name: string;
  readonly registrationNumber: string;
  readonly breed: string;
}

export interface DamInfo {
  readonly name: string;
  readonly registrationNumber: string;
  readonly breed: string;
}

export const PEDIGREE_CONFIG: ConnectorConfig = {
  id: 'pedigree',
  name: '혈통정보',
  enabled: true,
  syncIntervalMs: 7 * 24 * 60 * 60 * 1000, // 1주 1회
  retryCount: 3,
  retryDelayMs: 5000,
};

export class PedigreeConnector extends AbstractConnector<PedigreeRecord> {
  constructor(connectorConfig: ConnectorConfig = PEDIGREE_CONFIG) {
    super(connectorConfig);
  }

  async connect(): Promise<void> {
    const apiKey = config.PUBLIC_DATA_API_KEY;
    if (!apiKey) {
      logger.warn('[Pedigree] No API key — connector disabled');
      this.status = 'disconnected';
      return;
    }
    this.status = 'connected';
    logger.info('[Pedigree] Ready');
  }

  async fetch(since?: Date): Promise<FetchResult<PedigreeRecord>> {
    return this.fetchWithRetry(async () => {
      logger.info({ since }, '[Pedigree] Fetching records');
      return { data: [], count: 0, fetchedAt: new Date(), hasMore: false };
    });
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
  }
}
