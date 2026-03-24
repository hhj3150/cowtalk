// 농장식별번호 커넥터 — API 6) 농장식별번호정보 (15106233)
// smaXtec 농장 ↔ 이력제 농장 매핑

import { AbstractConnector } from '../base.connector.js';
import type { ConnectorConfig, FetchResult } from '../base.connector.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../lib/logger.js';
import { ekapeGet, extractItems } from './ekape-client.js';

export interface FarmIdRecord {
  readonly farmUniqueNo: string;     // 농장식별번호
  readonly farmName: string;
  readonly farmAddress: string;
  readonly ownerName: string;
  readonly animalType: string;        // 축종
  readonly headCount: number | null;  // 두수
}

export const FARM_ID_CONFIG: ConnectorConfig = {
  id: 'farm-id',
  name: '농장식별번호',
  enabled: true,
  syncIntervalMs: 24 * 60 * 60 * 1000,
  retryCount: 3,
  retryDelayMs: 5000,
};

export class FarmIdConnector extends AbstractConnector<FarmIdRecord> {
  private readonly apiBase = 'http://data.ekape.or.kr/openapi-data/service/user/farm/farmUniqueNoSearch';

  constructor(connectorConfig: ConnectorConfig = FARM_ID_CONFIG) {
    super(connectorConfig);
  }

  async connect(): Promise<void> {
    if (!config.PUBLIC_DATA_API_KEY) {
      logger.warn('[FarmId] No API key — connector disabled');
      this.status = 'disconnected';
      return;
    }
    this.status = 'connected';
    logger.info('[FarmId] Ready');
  }

  async fetch(_since?: Date): Promise<FetchResult<FarmIdRecord>> {
    return this.fetchWithRetry(async () => {
      return { data: [], count: 0, fetchedAt: new Date(), hasMore: false };
    });
  }

  /** 농장식별번호로 단건 조회 */
  async fetchByFarmNo(farmUniqueNo: string, typeGbn = '0022'): Promise<FarmIdRecord | null> {
    if (!config.PUBLIC_DATA_API_KEY) return null;

    try {
      const res = await ekapeGet(
        this.apiBase,
        { farmUniqueNo, typeGbn },
        'FarmId',
      );

      const items = extractItems(res.body);
      const item = items[0];
      if (!item) return null;

      return {
        farmUniqueNo: String(item.farmUniqueNo ?? farmUniqueNo),
        farmName: String(item.farmNm ?? ''),
        farmAddress: String(item.farmAddr ?? ''),
        ownerName: String(item.ownerNm ?? ''),
        animalType: String(item.animalTypeNm ?? ''),
        headCount: Number(item.headCnt ?? 0) || null,
      };
    } catch (err) {
      logger.error({ err, farmUniqueNo }, '[FarmId] Fetch failed');
      return null;
    }
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
  }
}
