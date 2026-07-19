// @cowtalk/shared — 프론트+백 공유 타입, 상수, 스키마

export const COWTALK_VERSION = '5.0.0' as const;

// 타입
export * from './types/index.js';

// 상수
export * from './constants/index.js';

// 스키마
export * from './schemas/index.js';

// 유틸 (순수 함수)
export { parseMilkCsv, parseDelimited, detectMilkColumns, extractMilkRows } from './utils/milk-csv.js';
export type { MilkCsvResult, MilkCsvRow, DelimitedTable, MilkColumnMapping } from './utils/milk-csv.js';
export {
  computeMilkPricePerL,
  computeDailyFeedCost,
  MILK_FAT_BASE_PCT,
  SCC_GRADE1_MAX,
} from './utils/milk-price.js';
export type { MilkPriceInput, MilkPriceEstimate, FeedIngredient } from './utils/milk-price.js';
