// 한우 씨수소 정보 커넥터 — API 5) (15101999)
// ⚠️ 한우(beef) 전용! 젖소(dairy)에는 사용 불가
// 젖소 종모우: 한국종축개량협회(DCIC) 또는 젖소개량사업소 데이터 별도 필요
// 교배 추천, 혈통 관리 → SemenRecommendation 컴포넌트 연결

import { AbstractConnector } from '../base.connector.js';
import type { ConnectorConfig, FetchResult } from '../base.connector.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../lib/logger.js';
import { ekapeGet, extractItems } from './ekape-client.js';

export interface SemenBullRecord {
  readonly bullNo: string;            // 씨수소 번호
  readonly bullName: string;
  readonly birthDate: string;
  readonly fatherNo: string;          // 부 번호
  readonly motherNo: string;          // 모 번호
  readonly inbreedingCoeff: number | null; // 근교계수
  readonly isAlive: boolean;
  readonly breed: string;
}

export const SEMEN_CONFIG: ConnectorConfig = {
  id: 'semen',
  name: '씨수소정보',
  enabled: true,
  syncIntervalMs: 7 * 24 * 60 * 60 * 1000, // 1주
  retryCount: 3,
  retryDelayMs: 5000,
};

export class SemenConnector extends AbstractConnector<SemenBullRecord> {
  // apis.data.go.kr 경유 (농촌진흥청 국립축산과학원)
  private readonly apiBase = 'https://apis.data.go.kr/1390906/brblInfo_gong/getList_brblInfo';

  constructor(connectorConfig: ConnectorConfig = SEMEN_CONFIG) {
    super(connectorConfig);
  }

  async connect(): Promise<void> {
    if (!config.PUBLIC_DATA_API_KEY) {
      logger.warn('[Semen] No API key — connector disabled');
      this.status = 'disconnected';
      return;
    }
    this.status = 'connected';
    logger.info('[Semen] Ready');
  }

  /** 씨수소 목록 조회 (페이지네이션) */
  async fetch(_since?: Date): Promise<FetchResult<SemenBullRecord>> {
    return this.fetchWithRetry(async () => {
      if (!config.PUBLIC_DATA_API_KEY) {
        return { data: [], count: 0, fetchedAt: new Date(), hasMore: false };
      }

      const res = await ekapeGet(
        this.apiBase,
        { pageNo: '1', numOfRows: '100' },
        'Semen-List',
      );

      const items = extractItems(res.body);
      const bulls: SemenBullRecord[] = items.map((item) => ({
        bullNo: String(item.bullNo ?? item.kpnNo ?? ''),
        bullName: String(item.bullNm ?? item.kpnNm ?? ''),
        birthDate: String(item.birthYmd ?? ''),
        fatherNo: String(item.fatherNo ?? item.sireNo ?? ''),
        motherNo: String(item.motherNo ?? item.damNo ?? ''),
        inbreedingCoeff: Number(item.inbreedCoef ?? 0) || null,
        isAlive: String(item.aliveYn ?? 'Y') === 'Y',
        breed: String(item.breedNm ?? '한우'),
      }));

      logger.info({ count: bulls.length }, '[Semen] Fetched bull list');

      return {
        data: bulls,
        count: bulls.length,
        fetchedAt: new Date(),
        hasMore: false,
      };
    });
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
  }
}
