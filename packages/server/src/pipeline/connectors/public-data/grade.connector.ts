// 축산물등급판정 커넥터 — 등급판정확인서 + 등급판정정보 + 경락가격
// API 2) 등급판정확인서 발급정보 (15058923 구독)
// API 4) 축산물등급판정정보 (15058822 신규)

import { AbstractConnector } from '../base.connector.js';
import type { ConnectorConfig, FetchResult } from '../base.connector.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../lib/logger.js';
import { ekapeGet, extractItems } from './ekape-client.js';

// ===========================
// 타입
// ===========================

export interface GradeResult {
  readonly cattleNo: string;
  readonly grade: string;           // 등급 (1++, 1+, 1, 2, 3)
  readonly qualityGrade: string;    // 육질등급
  readonly yieldGrade: string;      // 육량등급
  readonly weight: number | null;   // 도체중(kg)
  readonly judgeYmd: string;        // 판정일
  readonly abattNm: string;         // 도축장명
}

export interface AuctionPrice {
  readonly judgeYmd: string;          // 경매일
  readonly breedNm: string;           // 품종
  readonly gradeNm: string;           // 등급
  readonly avgPrice: number | null;   // 평균 경락가 (원/kg)
  readonly maxPrice: number | null;
  readonly minPrice: number | null;
  readonly totalQty: number | null;   // 두수
}

export const GRADE_CONFIG: ConnectorConfig = {
  id: 'grade',
  name: '축산물등급판정',
  enabled: true,
  syncIntervalMs: 6 * 60 * 60 * 1000, // 6시간
  retryCount: 3,
  retryDelayMs: 5000,
};

// ===========================
// 커넥터
// ===========================

export class GradeConnector extends AbstractConnector<GradeResult> {
  // 등급판정정보 (API 4) — 소 등급판정결과 + 경락가격
  private readonly auctBase = 'http://data.ekape.or.kr/openapi-data/service/user/grade/auct/cattle';

  constructor(connectorConfig: ConnectorConfig = GRADE_CONFIG) {
    super(connectorConfig);
  }

  async connect(): Promise<void> {
    if (!config.PUBLIC_DATA_API_KEY) {
      logger.warn('[Grade] No API key — connector disabled');
      this.status = 'disconnected';
      return;
    }
    this.status = 'connected';
    logger.info('[Grade] Ready');
  }

  async fetch(_since?: Date): Promise<FetchResult<GradeResult>> {
    return this.fetchWithRetry(async () => {
      logger.info('[Grade] Fetch not implemented for batch — use single lookups');
      return { data: [], count: 0, fetchedAt: new Date(), hasMore: false };
    });
  }

  /** 이력번호로 등급판정 결과 조회 */
  async fetchGradeByTraceId(traceId: string): Promise<GradeResult | null> {
    if (!config.PUBLIC_DATA_API_KEY) return null;

    try {
      const res = await ekapeGet(
        `${this.auctBase}/gradeInfo`,
        { cattleNo: traceId },
        'Grade-Result',
      );

      const items = extractItems(res.body);
      const item = items[0];
      if (!item) return null;

      return {
        cattleNo: String(item.cattleNo ?? traceId),
        grade: String(item.gradeNm ?? item.grade ?? ''),
        qualityGrade: String(item.qgrade ?? item.qualityGrade ?? ''),
        yieldGrade: String(item.ygrade ?? item.yieldGrade ?? ''),
        weight: Number(item.weight ?? item.cweight ?? 0) || null,
        judgeYmd: String(item.judgeYmd ?? ''),
        abattNm: String(item.abattNm ?? ''),
      };
    } catch (err) {
      logger.error({ err, traceId }, '[Grade] fetchGradeByTraceId failed');
      return null;
    }
  }

  /** 소도체 등급별 경락가격 조회 (최근 일자) */
  async fetchAuctionPrices(params: {
    startYmd?: string;
    endYmd?: string;
    breedCd?: string;
  } = {}): Promise<readonly AuctionPrice[]> {
    if (!config.PUBLIC_DATA_API_KEY) return [];

    try {
      const queryParams: Record<string, string> = {};
      if (params.startYmd) queryParams.startYmd = params.startYmd;
      if (params.endYmd) queryParams.endYmd = params.endYmd;
      if (params.breedCd) queryParams.breedCd = params.breedCd;

      const res = await ekapeGet(
        `${this.auctBase}/auctPriceInfo`,
        queryParams,
        'Grade-AuctionPrice',
      );

      const items = extractItems(res.body);
      return items.map((item) => ({
        judgeYmd: String(item.judgeYmd ?? ''),
        breedNm: String(item.breedNm ?? ''),
        gradeNm: String(item.gradeNm ?? ''),
        avgPrice: Number(item.avgPrice ?? item.avgAmt ?? 0) || null,
        maxPrice: Number(item.maxPrice ?? item.maxAmt ?? 0) || null,
        minPrice: Number(item.minPrice ?? item.minAmt ?? 0) || null,
        totalQty: Number(item.totalQty ?? item.cnt ?? 0) || null,
      }));
    } catch (err) {
      logger.error({ err }, '[Grade] fetchAuctionPrices failed');
      return [];
    }
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
  }
}
