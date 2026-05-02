// CowTalk 대화형 AI 서비스
// 사용자 질문 + 역할 + 관련 프로파일 → Claude 응답

import type { Role, ChatResponse } from '@cowtalk/shared';
import { callClaudeForChatJson, callClaudeForChatWithTools, type StreamCallbacks } from '../ai-brain/claude-client.js';
import { SYSTEM_PROMPT } from '../ai-brain/prompts/system-prompt.js';
import {
  buildConversationPrompt,
  type ConversationTurn,
} from '../ai-brain/prompts/conversation-prompt.js';
import { resolveContext, type DetectedType } from './context-builder.js';
import { getRoleTone } from './role-tone.js';
import { logger } from '../lib/logger.js';
import { getLabelContextForEventType, formatLabelContext } from '../ai-brain/label-context.js';
import { saveChatConversation } from './chat-learner.js';
import { detectReportIntent } from '../services/report/intentDetector.js';
import { collectReportData } from '../services/report/dataCollector.js';
import { generateReportContent } from '../services/report/aiContentGenerator.js';
import { generateDocx } from '../services/report/generators/docxGenerator.js';
import { generateXlsx } from '../services/report/generators/xlsxGenerator.js';
import { generatePptx } from '../services/report/generators/pptxGenerator.js';
import { generatePdf } from '../services/report/generators/pdfGenerator.js';
import { REPORT_CONFIG } from '../services/report/config.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

// ===========================
// 대화 메시지 (JSON 응답)
// ===========================

export interface ChatMessageRequest {
  readonly question: string;
  readonly role: Role;
  readonly farmId: string | null;
  readonly animalId: string | null;
  readonly userId?: string;
  readonly conversationHistory: readonly ConversationTurn[];
  readonly dashboardContext?: string;
  readonly uiLang?: 'ko' | 'en' | 'uz' | 'ru' | 'mn';
}

const UI_LANG_NAMES: Readonly<Record<string, string>> = {
  ko: '한국어',
  en: '영어 (English)',
  uz: '우즈벡어 (O\'zbek tili)',
  ru: '러시아어 (Русский)',
  mn: '몽골어 (Монгол хэл)',
};

function buildUiLangDirective(uiLang: string | undefined): string {
  if (!uiLang) return '';
  const langName = UI_LANG_NAMES[uiLang] ?? uiLang;
  return `\n\n## UI 언어 힌트\n사용자가 인터페이스에서 **${langName}**를 선택했습니다. 사용자 메시지에 명시적 언어 전환 요청이 없으면 **${langName}**로 응답하세요. 입력 내용이 다른 언어로 보이더라도 UI 선택을 우선 신호로 간주하세요 (단, "answer in English" 같이 명시 요청이 있으면 그 요청이 최우선).`;
}

export async function handleChatMessage(
  request: ChatMessageRequest,
): Promise<ChatResponse> {
  const { question, role, farmId, animalId, conversationHistory, dashboardContext, uiLang } = request;

  // 1. 컨텍스트 해결 (실패해도 fallback으로 응답)
  let context: Awaited<ReturnType<typeof resolveContext>>['context'];
  let detectedType: DetectedType = 'general';
  try {
    const resolved = await resolveContext(
      question, farmId, animalId, role, dashboardContext,
    );
    context = resolved.context;
    detectedType = resolved.detectedType;
  } catch (err) {
    logger.warn({ err, farmId, animalId }, '[Chat] Context resolution failed — using general context');
    context = { type: 'general' } as typeof context;
  }

  // 2. 레이블 컨텍스트 조회 (집단지성 — 실패 무시)
  let labelContext: string | undefined;
  try {
    if (context.type === 'animal' && context.profile.activeEvents.length > 0) {
      const primaryEvent = context.profile.activeEvents[0];
      if (primaryEvent) {
        const summary = await getLabelContextForEventType(primaryEvent.type, farmId);
        if (summary) {
          labelContext = formatLabelContext(summary, primaryEvent.type);
        }
      }
    }
  } catch {
    // 레이블 조회 실패는 비치명적
  }

  // 3. 프롬프트 빌드
  const prompt = buildConversationPrompt(
    question, role, context, conversationHistory, { labelContext },
  );

  // 3. 역할별 톤 설정
  const roleTone = getRoleTone(role);
  const systemPrompt = `${SYSTEM_PROMPT}\n\n## 톤 설정\n${roleTone.systemAddendum}\n\n## 환각 방지\n- 데이터에 포함되지 않은 수치를 절대 만들어내지 마세요.\n- 확인되지 않은 사항은 "데이터 없음"으로 명시하세요.\n- 모든 수치는 data_references에 출처를 반드시 기록하세요.${buildUiLangDirective(uiLang)}`;

  // 4. Claude API 호출
  const result = await callClaudeForChatJson(systemPrompt, prompt);

  if (result) {
    const parsed = result.parsed;
    const answer = typeof parsed.answer === 'string' ? parsed.answer : '응답을 생성할 수 없습니다.';

    // 대화 저장 + 학습 신호 추출 (비동기, fire-and-forget)
    if (request.userId) {
      void saveChatConversation({
        userId: request.userId,
        role,
        animalId,
        farmId,
        question,
        answer,
        contextType: detectedType,
      });
    }

    return {
      answer,
      dataReferences: Array.isArray(parsed.data_references)
        ? parsed.data_references.filter((v): v is string => typeof v === 'string')
        : [],
      followUpSuggestions: Array.isArray(parsed.follow_up_suggestions)
        ? parsed.follow_up_suggestions.filter((v): v is string => typeof v === 'string')
        : [],
      role,
      context: detectedType,
    };
  }

  // fallback — API 키 없거나 호출 실패
  logger.warn('Claude API unavailable for chat — returning fallback');
  return buildFallbackResponse(question, role, detectedType);
}

// ===========================
// SSE 스트리밍 대화
// ===========================

export async function handleChatStream(
  request: ChatMessageRequest,
  callbacks: StreamCallbacks,
): Promise<void> {
  const { question, role, farmId, animalId, conversationHistory, dashboardContext, uiLang } = request;

  // ── 보고서 인텐트 감지 — 파일 생성 후 다운로드 링크 반환 ──
  const reportIntent = detectReportIntent(question);
  if (reportIntent.isReport) {
    try {
      const reportParams: Record<string, string | number | undefined> = {};
      if (reportIntent.traceNo) reportParams['traceNo'] = reportIntent.traceNo;
      if (farmId) reportParams['farmId'] = farmId;

      callbacks.onText('📄 보고서를 생성하고 있습니다...\n\n');

      const dbData = await collectReportData(
        reportIntent.reportType ?? 'custom',
        reportParams,
      );

      const reportContent = await generateReportContent({
        reportType: (reportIntent.reportType ?? 'custom') as Parameters<typeof generateReportContent>[0]['reportType'],
        outputFormat: reportIntent.format ?? 'docx',
        userPrompt: reportIntent.cleanPrompt ?? question,
        dbData: dbData as Parameters<typeof generateReportContent>[0]['dbData'],
      });

      if (!fs.existsSync(REPORT_CONFIG.OUTPUT_DIR)) {
        fs.mkdirSync(REPORT_CONFIG.OUTPUT_DIR, { recursive: true });
      }

      const fileId = uuidv4();
      const dateStr = new Date().toISOString().split('T')[0]!.replace(/-/g, '');
      const safeType = (reportIntent.reportType ?? 'custom').replace(/[^a-zA-Z0-9_]/g, '');
      const fmt = reportIntent.format ?? 'docx';
      const fileName = `cowtalk_${safeType}_${dateStr}.${fmt}`;
      const outputPath = path.join(REPORT_CONFIG.OUTPUT_DIR, `${fileId}_${fileName}`);

      const generators: Readonly<Record<string, (c: Record<string, unknown>, p: string) => Promise<void>>> = {
        docx: generateDocx, xlsx: generateXlsx, pptx: generatePptx, pdf: generatePdf,
      };
      const gen = generators[fmt];
      if (gen) await gen(reportContent, outputPath);

      const title = String(reportContent['title'] ?? fileName);
      const downloadUrl = `/api/report-generate/download/${fileId}`;
      const resultMsg = `✅ **"${title}"** 보고서가 생성되었습니다.\n\n📁 파일: ${fileName}\n🔗 [다운로드](${downloadUrl})\n⏰ 48시간 후 자동 삭제됩니다.`;
      callbacks.onDone(resultMsg);
      return;
    } catch (err) {
      logger.warn({ err }, '[Chat→Report] Report generation failed, falling back to chat');
      // 실패 시 일반 채팅으로 폴백
    }
  }

  // 컨텍스트 해결 (실패해도 일반 대화 가능)
  let context: Awaited<ReturnType<typeof resolveContext>>['context'];
  try {
    const resolved = await resolveContext(
      question, farmId, animalId, role, dashboardContext,
    );
    context = resolved.context;
  } catch (err) {
    logger.warn({ err, farmId, animalId }, '[Chat] Stream context resolution failed — using general');
    context = { type: 'general' } as typeof context;
  }

  // 레이블 컨텍스트 조회 (전부 try-catch — 실패해도 대화는 계속)
  let labelContext: string | undefined;
  try {
    if (context.type === 'animal' && context.profile.activeEvents.length > 0) {
      const primaryEvent = context.profile.activeEvents[0];
      if (primaryEvent) {
        const summary = await getLabelContextForEventType(primaryEvent.type, farmId);
        if (summary) {
          labelContext = formatLabelContext(summary, primaryEvent.type);
        }
      }
    }

    // 농장 단위 최근 학습 패턴도 항상 주입 (팅커벨 진화 루프)
    if (!labelContext && farmId) {
      const commonTypes = ['temperature_high', 'rumination_decrease', 'estrus', 'health_general'];
      for (const eventType of commonTypes) {
        const summary = await getLabelContextForEventType(eventType, farmId);
        if (summary) {
          labelContext = formatLabelContext(summary, eventType);
          break;
        }
      }
    }
  } catch {
    // 레이블 조회 실패는 비치명적
  }

  const prompt = buildConversationPrompt(
    question, role, context, conversationHistory, { streaming: true, labelContext },
  );

  const roleTone = getRoleTone(role);
  // 스트리밍: JSON 강제 제거, 자연어 텍스트 응답
  const basePrompt = SYSTEM_PROMPT.replace(
    /6\.\s*\*\*응답 형식\*\*.*?JSON 형식을 따르세요\./s,
    '6. **자연어 응답**: 사용자가 "몽골어로 답해줘", "answer in English" 같이 특정 언어로 답변을 요청하면 입력 언어와 무관하게 그 언어로만 응답하세요 (이전 턴에서 지정된 언어가 있으면 유지). 명시 요청이 없으면 사용자가 쓴 언어로 답변하세요 — 한국어면 한국어, 영어면 영어, 몽골어(키릴에 Өө/Үү 포함)면 몽골어, 우즈벡어면 우즈벡어, 러시아어면 러시아어. JSON 형식으로 응답하지 마세요.',
  );
  const systemPrompt = `${basePrompt}\n\n## 톤 설정\n${roleTone.systemAddendum}\n\n## 환각 방지\n- 데이터에 포함되지 않은 수치를 절대 만들어내지 마세요.\n- 확인되지 않은 사항은 "데이터 없음"으로 명시하세요.${buildUiLangDirective(uiLang)}`;

  // 스트리밍 답변을 모아서 학습에 활용
  const wrappedCallbacks: StreamCallbacks = {
    onText: (text: string) => {
      callbacks.onText(text);
    },
    onDone: (fullText: string) => {
      callbacks.onDone(fullText);
      // 대화 저장 + 학습 (비동기, fire-and-forget)
      if (request.userId) {
        void saveChatConversation({
          userId: request.userId,
          role,
          animalId,
          farmId,
          question,
          answer: fullText,
          contextType: context.type,
        });
      }
    },
    onError: callbacks.onError,
    onToolEvent: callbacks.onToolEvent,
  };

  // Tool Use 활성화 — 팅커벨이 필요할 때 DB를 직접 조회
  // Gateway 경유: audit log + role-based access control
  await callClaudeForChatWithTools(systemPrompt, prompt, wrappedCallbacks, {
    userId: request.userId,
    role,
    farmId: farmId ?? undefined,
  });
}

// ===========================
// Fallback 응답 생성
// ===========================

const FALLBACK_HINTS: Readonly<Record<string, readonly string[]>> = {
  farmer: [
    '대시보드에서 오늘의 할 일을 확인하세요.',
    '센서 장착률을 높이면 더 정확한 분석이 가능합니다.',
  ],
  veterinarian: [
    '긴급 진료 대상은 대시보드 상단에서 확인하세요.',
    '경합 해석(Decision Fusion)으로 발정/질병을 구분할 수 있습니다.',
  ],
  government_admin: [
    '관할 지역 현황은 대시보드에서 확인하세요.',
    'Top 경고 농장을 우선 점검하세요.',
  ],
  quarantine_officer: [
    '체온이상 클러스터를 대시보드에서 확인하세요.',
    '동시다발 발열은 전염병 가능성을 배제할 수 없습니다.',
  ],
};

function buildFallbackResponse(
  _question: string,
  role: Role,
  detectedType: DetectedType,
): ChatResponse {
  const hints = FALLBACK_HINTS[role] ?? [];
  const hintText = hints.length > 0
    ? `\n\n참고:\n${hints.map((h) => `• ${h}`).join('\n')}`
    : '';

  return {
    answer: `AI 엔진이 현재 사용 불가합니다. 대시보드의 데이터를 직접 확인해 주세요.${hintText}`,
    dataReferences: [],
    followUpSuggestions: ['대시보드 현황 확인', '센서 데이터 조회'],
    role,
    context: detectedType,
    isFallback: true,
  };
}

// ===========================
// 스트리밍 Fallback — 데이터 기반 응답
// ===========================

import type { ChatContext } from '../ai-brain/prompts/conversation-prompt.js';

export function buildStreamFallback(
  _question: string,
  role: Role,
  context: ChatContext,
): string {
  const lines: string[] = [];

  if (context.type === 'quarantine' && context.quarantineData) {
    const q = context.quarantineData;
    lines.push(`🛡️ **방역 모니터링 현황** (AI 엔진 오프라인 — 데이터 직접 제공)`);
    lines.push(`\n• 위험 등급: **${q.kpi.riskLevel.toUpperCase()}** | 발열: **${String(q.kpi.feverAnimals)}두** | 집단발열 농장: **${String(q.kpi.clusterFarms)}개**`);
    if (q.top5RiskFarms.length > 0) {
      lines.push(`\n**위험 농장:**`);
      for (const f of q.top5RiskFarms.slice(0, 5)) {
        lines.push(`• ${f.farmName}: 발열 ${String(f.feverCount)}두, 위험점수 ${String(f.riskScore)}`);
      }
    }
  } else if (context.type === 'global' && context.globalContext) {
    const ctx = context.globalContext;
    lines.push(`📊 **CowTalk 실시간 현황** (AI 엔진 오프라인 — 데이터 직접 제공)`);
    lines.push(`\n• 관리 농장: **${String(ctx.totalFarms)}개** | 관리 두수: **${String(ctx.totalAnimals)}두**`);

    // 알람 요약
    const alarmTypes = ['calving', 'health_warning', 'temperature_warning', 'estrus', 'rumination_warning', 'activity_warning'] as const;
    const LABELS: Record<string, string> = { calving: '분만', health_warning: '건강경고', temperature_warning: '체온', estrus: '발정', rumination_warning: '반추', activity_warning: '활동' };
    const parts: string[] = [];
    for (const type of alarmTypes) {
      const animals = ctx.alarmsByType[type];
      if (animals && animals.length > 0) {
        parts.push(`${LABELS[type] ?? type} **${String(animals.length)}두**`);
      }
    }
    if (parts.length > 0) {
      lines.push(`\n**현재 알람:** ${parts.join(' | ')}`);
    }

    // 긴급 농장
    if (ctx.farmAlertRanking.length > 0) {
      lines.push(`\n**긴급 농장 TOP 5:**`);
      for (const f of ctx.farmAlertRanking.slice(0, 5)) {
        lines.push(`• ${f.farmName}: ${String(f.alertCount)}건`);
      }
    }
  } else if (context.type === 'farm' && context.profile) {
    lines.push(`📊 **${context.profile.name} 현황** (AI 엔진 오프라인)`);
    lines.push(`• 두수: ${String(context.profile.totalAnimals)}두 | 활성 알람: ${String(context.profile.activeSmaxtecEvents.length)}건`);
  } else if (context.type === 'animal' && context.profile) {
    const p = context.profile;
    lines.push(`🐄 **#${p.earTag} (${p.farmName})** (AI 엔진 오프라인)`);
    const s = p.latestSensor;
    if (s.temperature !== null) lines.push(`• 체온: ${String(s.temperature)}°C`);
    if (s.rumination !== null) lines.push(`• 반추: ${String(s.rumination)}분/일`);
    if (p.activeEvents.length > 0) {
      lines.push(`• 활성 알람: ${p.activeEvents.map((e) => e.type).join(', ')}`);
    }
  }

  if (lines.length === 0) {
    const hints = FALLBACK_HINTS[role] ?? [];
    lines.push('AI 엔진이 현재 오프라인입니다. 대시보드에서 실시간 데이터를 확인해주세요.');
    for (const h of hints) lines.push(`• ${h}`);
  }

  lines.push(`\n💡 AI 분석이 필요하면 잠시 후 다시 시도해 주세요.`);
  return lines.join('\n');
}
