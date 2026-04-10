// CowTalk 보고서 AI 콘텐츠 생성기
// 실제 DB 데이터를 Claude에게 전달하여 구조화된 JSON 응답을 받는다.

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config/index.js';
import { REPORT_CONFIG } from './config.js';
import type { OutputFormat, ReportType } from './config.js';
import type { ReportData } from './dataCollector.js';
import { logger } from '../../lib/logger.js';
import { deidentifyRecord } from '../../ai-brain/prompts/deidentify.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    if (!config.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다.');
    }
    client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  }
  return client;
}

export interface GenerateContentOptions {
  readonly reportType: ReportType;
  readonly outputFormat: OutputFormat;
  readonly userPrompt: string;
  readonly dbData: ReportData;
  readonly language?: string;
}

export async function generateReportContent(options: GenerateContentOptions): Promise<Record<string, unknown>> {
  const { reportType, outputFormat, userPrompt, dbData, language = 'ko' } = options;

  const systemPrompt = `당신은 CowTalk 시스템의 축산 데이터 분석 보고서 작성 AI입니다.
smaXtec 반추위 센서 데이터, 번식 기록, 건강 알람 등 축산 현장 데이터를 기반으로 보고서를 작성합니다.

## 작성 규칙
1. 반드시 순수 JSON만 출력하세요. 코드블록(\`\`\`), 설명, 마크다운 없이 JSON만.
2. 제공된 실제 데이터(dbData)를 정확히 반영하세요. 숫자를 변조하지 마세요.
3. 수의학/축산학 전문 용어를 정확히 사용하세요.
4. 단위를 반드시 명시하세요: 두(頭), L, kg, ℃, 원, %, 분 등.
5. 분석과 해석을 추가하세요 — 단순 데이터 나열이 아니라 "의미"를 설명하세요.
6. ${language === 'ko' ? '한국어' : 'English'}로 작성하세요.

## 출력 JSON 스키마 (${outputFormat})
${getSchema(outputFormat)}`;

  // 비식별화: Claude API 전송 전 DB 데이터의 개체·농장 식별자를 해시 토큰으로 치환
  const safeDbData = deidentifyRecord(dbData);

  const userMessage = `## 보고서 요청
- 유형: ${reportType}
- 포맷: ${outputFormat}
- 사용자 요청: ${userPrompt}

## 실제 DB 데이터 (개인정보 비식별화 처리됨)
${JSON.stringify(safeDbData, null, 2)}

위 실제 데이터를 기반으로 보고서를 JSON으로 생성하세요. 데이터의 의미를 해석하고 개선 제안도 포함하세요.`;

  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: REPORT_CONFIG.AI.MODEL,
    max_tokens: REPORT_CONFIG.AI.MAX_TOKENS,
    temperature: REPORT_CONFIG.AI.TEMPERATURE,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    logger.error({ raw: cleaned.substring(0, 300) }, '[AI Report] JSON parse failed');
    throw new Error('AI가 유효한 JSON을 반환하지 않았습니다. 다시 시도해주세요.');
  }
}

function getSchema(format: OutputFormat): string {
  const schemas: Record<string, string> = {
    docx: `{
  "title": "보고서 제목",
  "subtitle": "부제목",
  "date": "YYYY-MM-DD",
  "author": "CowTalk AI",
  "sections": [
    {
      "heading": "섹션 제목",
      "level": 1,
      "content": [
        { "type": "paragraph", "text": "분석 텍스트" },
        { "type": "bullet_list", "items": ["항목"] },
        { "type": "numbered_list", "items": ["항목"] },
        { "type": "table", "headers": ["열"], "rows": [["값"]] },
        { "type": "key_value", "pairs": [{ "key": "항목", "value": "값" }] }
      ]
    }
  ],
  "summary": "총평/개선 제안"
}`,
    xlsx: `{
  "title": "제목",
  "sheets": [
    {
      "name": "시트명 (31자 이내)",
      "headers": ["열1", "열2"],
      "rows": [["값1", "값2"]],
      "column_widths": [20, 15],
      "column_formats": ["text", "number"],
      "summary_row": { "label": "합계", "formulas": ["", "SUM"] }
    }
  ]
}`,
    pptx: `{
  "title": "발표 제목",
  "subtitle": "부제목",
  "slides": [
    { "layout": "title", "title": "제목", "subtitle": "부제목" },
    { "layout": "content", "title": "제목", "bullets": ["포인트"], "notes": "발표자 노트" },
    { "layout": "table", "title": "제목", "table": { "headers": ["열"], "rows": [["값"]] } },
    { "layout": "two_column", "title": "제목",
      "left": { "heading": "좌측", "bullets": ["항목"] },
      "right": { "heading": "우측", "bullets": ["항목"] } }
  ]
}`,
    pdf: `docx와 동일한 JSON 스키마 사용`,
  };
  return schemas[format] ?? schemas['docx']!;
}
