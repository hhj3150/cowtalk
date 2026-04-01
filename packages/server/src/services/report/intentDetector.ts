// CowTalk 채팅에서 보고서 생성 의도 감지

import type { OutputFormat, ReportType } from './config.js';

const REPORT_TRIGGERS: readonly string[] = [
  '보고서', '리포트', 'report', '레포트',
  '정리해줘', '작성해줘', '만들어줘', '출력해줘',
  '엑셀로', '워드로', 'ppt로', 'pdf로',
  '파일로', '문서로', '다운로드',
];

interface FormatRule {
  readonly format: OutputFormat;
  readonly patterns: readonly string[];
}

const FORMAT_DETECT: readonly FormatRule[] = [
  { format: 'xlsx', patterns: ['엑셀', 'excel', 'xlsx', '스프레드시트', '표로 정리'] },
  { format: 'pptx', patterns: ['ppt', '발표', '프레젠테이션', '슬라이드'] },
  { format: 'pdf', patterns: ['pdf'] },
  { format: 'docx', patterns: ['워드', 'word', 'docx', '문서'] },
];

interface TypeRule {
  readonly type: ReportType;
  readonly patterns: readonly string[];
}

const TYPE_DETECT: readonly TypeRule[] = [
  { type: 'sensor_alert', patterns: ['알람', '알럼', 'alert', '센서'] },
  { type: 'herd_health', patterns: ['건강', '체온', '반추', 'health'] },
  { type: 'breeding', patterns: ['번식', '수정', '임검', '수태'] },
  { type: 'heat_detection', patterns: ['발정', 'heat'] },
  { type: 'farm_daily', patterns: ['일일', '오늘', '당일', 'daily'] },
  { type: 'farm_monthly', patterns: ['월간', '이번달', '이번 달', 'monthly'] },
  { type: 'animal_detail', patterns: ['개체', '이력번호', '개별'] },
];

export interface ReportIntent {
  readonly isReport: boolean;
  readonly format?: OutputFormat;
  readonly reportType?: ReportType;
  readonly traceNo?: string | null;
  readonly cleanPrompt?: string;
}

export function detectReportIntent(message: string): ReportIntent {
  const msg = message.toLowerCase();
  const isReport = REPORT_TRIGGERS.some((t) => msg.includes(t));
  if (!isReport) return { isReport: false };

  let format: OutputFormat = 'docx';
  for (const { format: f, patterns } of FORMAT_DETECT) {
    if (patterns.some((p) => msg.includes(p))) {
      format = f;
      break;
    }
  }

  let reportType: ReportType = 'custom';
  for (const { type, patterns } of TYPE_DETECT) {
    if (patterns.some((p) => msg.includes(p))) {
      reportType = type;
      break;
    }
  }

  const traceNoMatch = message.match(/\d{12}/);

  return {
    isReport: true,
    format,
    reportType,
    traceNo: traceNoMatch?.[0] ?? null,
    cleanPrompt: message,
  };
}
