import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SemenConnector } from '../semen.connector.js';

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

describe('SemenConnector', () => {
  let connector: SemenConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new SemenConnector();
  });

  describe('connect()', () => {
    it('API 키가 있으면 connected 상태', async () => {
      await connector.connect();
      expect(connector.getStatus()).toBe('connected');
    });
  });

  describe('fetch()', () => {
    it('씨수소 목록을 정상 반환', async () => {
      await connector.connect();

      mockEkapeGet.mockResolvedValue({
        resultCode: '00',
        resultMsg: 'OK',
        body: {},
        raw: {},
      });

      mockExtractItems.mockReturnValueOnce([
        {
          kpnNo: 'KPN1148',
          kpnNm: '타워',
          birthYmd: '20150312',
          sireNo: 'KPN0891',
          damNo: 'KPN0652',
          inbreedCoef: 0.032,
          aliveYn: 'Y',
          breedNm: '한우',
        },
        {
          kpnNo: 'KPN1186',
          kpnNm: '용산',
          birthYmd: '20160520',
          sireNo: 'KPN0945',
          damNo: 'KPN0712',
          inbreedCoef: 0.025,
          aliveYn: 'N',
          breedNm: '한우',
        },
      ]);

      const result = await connector.fetch();

      expect(result.count).toBe(2);
      expect(result.data).toHaveLength(2);

      expect(result.data[0]!.bullNo).toBe('KPN1148');
      expect(result.data[0]!.bullName).toBe('타워');
      expect(result.data[0]!.fatherNo).toBe('KPN0891');
      expect(result.data[0]!.inbreedingCoeff).toBe(0.032);
      expect(result.data[0]!.isAlive).toBe(true);

      expect(result.data[1]!.bullNo).toBe('KPN1186');
      expect(result.data[1]!.isAlive).toBe(false);
    });

    it('API 키 없으면 빈 결과 반환', async () => {
      const { config: mockConfig } = await import('../../../../config/index.js');
      const original = mockConfig.PUBLIC_DATA_API_KEY;
      (mockConfig as Record<string, unknown>).PUBLIC_DATA_API_KEY = '';

      const noKeyConnector = new SemenConnector();
      const result = await noKeyConnector.fetch();

      expect(result.count).toBe(0);
      expect(result.data).toHaveLength(0);

      (mockConfig as Record<string, unknown>).PUBLIC_DATA_API_KEY = original;
    });

    it('페이지네이션 파라미터 전달 확인', async () => {
      await connector.connect();

      mockEkapeGet.mockResolvedValue({
        resultCode: '00',
        resultMsg: 'OK',
        body: {},
        raw: {},
      });
      mockExtractItems.mockReturnValueOnce([]);

      await connector.fetch();

      expect(mockEkapeGet).toHaveBeenCalledWith(
        expect.stringContaining('brblInfo_gong'),
        expect.objectContaining({ pageNo: '1', numOfRows: '100' }),
        'Semen-List',
      );
    });
  });
});
