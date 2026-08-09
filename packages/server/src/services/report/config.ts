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
    // 모델 ID 를 여기에 다시 적지 않는다 — 예전에 Sonnet 4.0 이 deprecated 된 뒤에도
    // 이 상수만 남아 보고서 생성이 조용히 구형 모델을 쓰고 있었다.
    // 실제 값은 config.ANTHROPIC_MODEL(환경변수로 교체 가능)에서 읽는다.
    MAX_TOKENS: 4096,
    // sampling 파라미터를 받지 않는 모델에서는 temperatureParam 이 알아서 뺀다.
    TEMPERATURE: 0.2,
  },
} as const;

export type ReportType = (typeof REPORT_CONFIG.REPORT_TYPES)[keyof typeof REPORT_CONFIG.REPORT_TYPES];
export type OutputFormat = (typeof REPORT_CONFIG.OUTPUT_FORMATS)[number];
