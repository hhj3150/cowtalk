import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GradeConnector } from '../grade.connector.js';

// ekape-client 모듈을 모킹
vi.mock('../ekape-client.js', () => ({
  ekapeGet: vi.fn(),
  extractItems: vi.fn(),
}));

vi.mock('../../../../config/index.js', () => ({
  config: { PUBLIC_DATA_API_KEY: 'test-key-for-unit-test' },
}));

vi.mock('../../../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { ekapeGet, extractItems } from '../ekape-client.js';

const mockEkapeGet = vi.mocked(ekapeGet);
const mockExtractItems = vi.mocked(extractItems);

describe('GradeConnector', () => {
  let connector: GradeConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new GradeConnector();
  });

  describe('connect()', () => {
    it('API 키가 있으면 connected 상태', async () => {
      await connector.connect();
      expect(connector.getStatus()).toBe('connected');
    });

    it('API 키가 없으면 disconnected 상태', async () => {
      const { config: mockConfig } = await import('../../../../config/index.js');
      const original = mockConfig.PUBLIC_DATA_API_KEY;
      (mockConfig as Record<string, unknown>).PUBLIC_DATA_API_KEY = '';

      const noKeyConnector = new GradeConnector();
      await noKeyConnector.connect();
      expect(noKeyConnector.getStatus()).toBe('disconnected');

      (mockConfig as Record<string, unknown>).PUBLIC_DATA_API_KEY = original;
    });
  });

  describe('fetchGradeByTraceId()', () => {
    const TRACE_ID = '002132665191';

    it('등급판정 결과를 정상 반환', async () => {
      await connector.connect();

      mockEkapeGet.mockResolvedValue({
        resultCode: '00',
        resultMsg: 'NORMAL SERVICE.',
        body: { items: { item: [] } },
        raw: {},
      });

      mockExtractItems.mockReturnValueOnce([{
        cattleNo: '002132665191',
        gradeNm: '1+',
        qgrade: 'A',
        ygrade: 'B',
        weight: 420,
        judgeYmd: '20260315',
        abattNm: '포천축산물공판장',
      }]);

      const result = await connector.fetchGradeByTraceId(TRACE_ID);

      expect(result).not.toBeNull();
      expect(result!.cattleNo).toBe('002132665191');
      expect(result!.grade).toBe('1+');
      expect(result!.qualityGrade).toBe('A');
      expect(result!.yieldGrade).toBe('B');
      expect(result!.weight).toBe(420);
      expect(result!.judgeYmd).toBe('20260315');
      expect(result!.abattNm).toBe('포천축산물공판장');
    });

    it('결과가 없으면 null 반환', async () => {
      await connector.connect();

      mockEkapeGet.mockResolvedValue({
        resultCode: '00',
        resultMsg: 'NORMAL SERVICE.',
        body: {},
        raw: {},
      });
      mockExtractItems.mockReturnValueOnce([]);

      const result = await connector.fetchGradeByTraceId(TRACE_ID);
      expect(result).toBeNull();
    });

    it('API 키 없으면 null 반환', async () => {
      const { config: mockConfig } = await import('../../../../config/index.js');
      const original = mockConfig.PUBLIC_DATA_API_KEY;
      (mockConfig as Record<string, unknown>).PUBLIC_DATA_API_KEY = '';

      const result = await connector.fetchGradeByTraceId(TRACE_ID);
      expect(result).toBeNull();
      expect(mockEkapeGet).not.toHaveBeenCalled();

      (mockConfig as Record<string, unknown>).PUBLIC_DATA_API_KEY = original;
    });

    it('API 에러 시 null 반환', async () => {
      await connector.connect();
      mockEkapeGet.mockRejectedValueOnce(new Error('Network error'));

      const result = await connector.fetchGradeByTraceId(TRACE_ID);
      expect(result).toBeNull();
    });
  });

  describe('fetchAuctionPrices()', () => {
    it('경락가격 목록 반환', async () => {
      await connector.connect();

      mockEkapeGet.mockResolvedValue({
        resultCode: '00',
        resultMsg: 'NORMAL SERVICE.',
        body: {},
        raw: {},
      });

      mockExtractItems.mockReturnValueOnce([
        {
          judgeYmd: '20260401',
          breedNm: '한우',
          gradeNm: '1++',
          avgAmt: 28500,
          maxAmt: 32000,
          minAmt: 25000,
          cnt: 150,
        },
        {
          judgeYmd: '20260401',
          breedNm: '한우',
          gradeNm: '1+',
          avgPrice: 22000,
          maxPrice: 25000,
          minPrice: 19000,
          totalQty: 320,
        },
      ]);

      const prices = await connector.fetchAuctionPrices({
        startYmd: '20260401',
        endYmd: '20260403',
      });

      expect(prices).toHaveLength(2);
      expect(prices[0]!.breedNm).toBe('한우');
      expect(prices[0]!.gradeNm).toBe('1++');
      expect(prices[0]!.avgPrice).toBe(28500);
      expect(prices[1]!.avgPrice).toBe(22000);
      expect(prices[1]!.totalQty).toBe(320);
    });

    it('빈 결과 반환', async () => {
      await connector.connect();

      mockEkapeGet.mockResolvedValue({
        resultCode: '00',
        resultMsg: 'NORMAL SERVICE.',
        body: {},
        raw: {},
      });
      mockExtractItems.mockReturnValueOnce([]);

      const prices = await connector.fetchAuctionPrices();
      expect(prices).toHaveLength(0);
    });

    it('API 에러 시 빈 배열 반환', async () => {
      await connector.connect();
      mockEkapeGet.mockRejectedValueOnce(new Error('Timeout'));

      const prices = await connector.fetchAuctionPrices();
      expect(prices).toHaveLength(0);
    });
  });
});
