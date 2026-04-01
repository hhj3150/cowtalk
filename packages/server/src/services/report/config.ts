// CowTalk 보고서 생성 모듈 — 설정
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const REPORT_CONFIG = {
  OUTPUT_DIR: path.join(__dirname, '../../../uploads/reports'),
  FILE_RETENTION_HOURS: 48,

  REPORT_TYPES: {
    FARM_DAILY: 'farm_daily',
    FARM_MONTHLY: 'farm_monthly',
    HERD_HEALTH: 'herd_health',
    ANIMAL_DETAIL: 'animal_detail',
    SENSOR_ALERT: 'sensor_alert',
    BREEDING: 'breeding',
    HEAT_DETECTION: 'heat_detection',
    CUSTOM: 'custom',
  } as const,

  OUTPUT_FORMATS: ['docx', 'xlsx', 'pptx', 'pdf'] as const,

  DOCUMENT: {
    FONT: 'Malgun Gothic',
    FONT_EN: 'Arial',
    COLORS: {
      PRIMARY: '1B5E20',
      SECONDARY: '33691E',
      ACCENT: '0277BD',
      WARNING: 'E65100',
      DANGER: 'B71C1C',
      HEADER_BG: 'E8F5E9',
      TABLE_HEADER: '1B5E20',
      TABLE_ALT: 'F1F8E9',
      TEXT: '212121',
      LIGHT_TEXT: '757575',
    },
  },

  LOGO_PATH: path.join(__dirname, '../../../public/cowtalk-logo.png'),

  AI: {
    MODEL: 'claude-sonnet-4-20250514',
    MAX_TOKENS: 4096,
    TEMPERATURE: 0.2,
  },
} as const;

export type ReportType = (typeof REPORT_CONFIG.REPORT_TYPES)[keyof typeof REPORT_CONFIG.REPORT_TYPES];
export type OutputFormat = (typeof REPORT_CONFIG.OUTPUT_FORMATS)[number];
