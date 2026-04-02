// 혈통정보 커넥터 — 이력제번호로 부/모 정보 조회
// ekape traceNoSearch optionNo=1 응답에서 부/모 이력번호 파싱
// 부(父) 없으면 breeding_events → semenCatalog 연결로 대체

import { AbstractConnector } from '../base.connector.js';
import type { ConnectorConfig, FetchResult } from '../base.connector.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../lib/logger.js';
import { ekapeGet } from './ekape-client.js';

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

const TRACE_BASE = 'http://data.ekape.or.kr/openapi-data/service/user/animalTrace/traceNoSearch';

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

  /** 배치 조회 — 현재 미구현 (개별 조회만 지원) */
  async fetch(_since?: Date): Promise<FetchResult<PedigreeRecord>> {
    return this.fetchWithRetry(async () => ({
      data: [],
      count: 0,
      fetchedAt: new Date(),
      hasMore: false,
    }));
  }

  /**
   * 이력제번호로 혈통 조회 (단일 개체)
   * optionNo=1 기본정보에서 부/모 이력번호 파싱
   * ekape 필드명: sireTraceNo, damTraceNo (또는 fatherNo/motherNo)
   */
  async fetchPedigree(traceId: string): Promise<PedigreeRecord | null> {
    if (!config.PUBLIC_DATA_API_KEY || !traceId) {
      return null;
    }

    try {
      const res = await ekapeGet(
        TRACE_BASE,
        { traceNo: traceId, optionNo: '1' },
        'Pedigree-Basic',
      );

      if (!res.body) {
        logger.debug({ traceId }, '[Pedigree] No body — traceId 미등록 또는 API 오류');
        return null;
      }

      // body.items.item 또는 body.item
      const bodyAny = res.body as Record<string, unknown>;
      const items = bodyAny.items as Record<string, unknown> | undefined;
      const rawItem = items?.item ?? bodyAny.item;
      const item = Array.isArray(rawItem) ? rawItem[0] : rawItem;

      if (!item || typeof item !== 'object') {
        return null;
      }

      const data = item as Record<string, unknown>;

      // 부(父) 이력번호 — 필드명 여러 패턴 시도
      const sireNo = String(
        data.sireTraceNo ?? data.sireNo ?? data.fatherNo ?? data.sireCattleNo ?? ''
      ).trim();

      // 모(母) 이력번호
      const damNo = String(
        data.damTraceNo ?? data.damNo ?? data.motherNo ?? data.damCattleNo ?? ''
      ).trim();

      const breed = this.breedLabel(String(data.lsTypeNm ?? data.lsTypeCd ?? ''));
      const sex = this.sexLabel(String(data.sexNm ?? data.sexCd ?? ''));
      const birthDate = this.fmtDate(String(data.birthYmd ?? ''));

      logger.info({ traceId, sireNo: sireNo || 'N/A', damNo: damNo || 'N/A' }, '[Pedigree] Fetched');

      return {
        registrationNumber: traceId,
        animalName: null,
        breed,
        birthDate,
        sex,
        sire: sireNo ? { name: '', registrationNumber: sireNo, breed } : null,
        dam: damNo ? { name: '', registrationNumber: damNo, breed } : null,
      };
    } catch (err) {
      logger.warn({ err, traceId }, '[Pedigree] Fetch error');
      return null;
    }
  }

  /** YYYYMMDD → YYYY-MM-DD */
  private fmtDate(raw: string): string {
    const s = raw.replace(/\D/g, '');
    if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    return raw;
  }

  private sexLabel(code: string): string {
    const map: Record<string, string> = { '1': '수', '2': '암', 'M': '수', 'F': '암' };
    return map[code] ?? code;
  }

  private breedLabel(code: string): string {
    const map: Record<string, string> = { '1': '한우', '2': '젖소', '3': '육우', '4': '교잡우' };
    return map[code] ?? code;
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
  }
}
