// CowTalk 대화형 AI 서비스
// 사용자 질문 + 역할 + 관련 프로파일 → Claude 응답

import type { Role, ChatResponse } from '@cowtalk/shared';
import { callClaudeForChatJson, callClaudeForChatWithTools, shouldUseDeepThinking, type StreamCallbacks } from '../ai-brain/claude-client.js';
import { SYSTEM_PROMPT } from '../ai-brain/prompts/system-prompt.js';
import {
  buildConversationPrompt,
  type ConversationTurn,
} from '../ai-brain/prompts/conversation-prompt.js';
import { resolveContext, type DetectedType } from './context-builder.js';
import { getRoleTone } from './role-tone.js';
import { getFarmBreedingSettings } from '../services/breeding/farm-settings-sync.service.js';
import type { FarmBreedingSettings } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { getLabelContextForEventType, formatLabelContext, getHierarchicalLabelContext, formatHierarchicalLabelContext } from '../ai-brain/label-context.js';
import { parseDocument, type ParsedDocument } from '../services/document/document-parser.js';
import { detectSkill } from '../services/skills/skills-registry.js';
import { saveChatConversation, getFarmLearningSnapshot, formatFarmLearningContext } from './chat-learner.js';
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

/** Vision: 사용자가 첨부한 이미지 (base64) */
export interface ChatImage {
  readonly data: string; // base64 인코딩된 이미지 데이터
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

/** Files: 사용자가 첨부한 문서 (PDF·Excel·CSV) */
export interface ChatDocument {
  readonly data: string; // base64 인코딩
  readonly mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' | 'application/vnd.ms-excel' | 'text/csv';
  readonly filename?: string;
}

export interface ChatMessageRequest {
  readonly question: string;
  readonly role: Role;
  readonly farmId: string | null;
  readonly animalId: string | null;
  readonly userId?: string;
  readonly conversationHistory: readonly ConversationTurn[];
  readonly dashboardContext?: string;
  readonly uiLang?: 'ko' | 'en' | 'uz' | 'ru' | 'mn';
  readonly images?: readonly ChatImage[]; // Vision: 첨부 이미지 (최대 5장)
  readonly documents?: readonly ChatDocument[]; // Files: 첨부 문서 (PDF/Excel/CSV, 최대 3개)
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

/**
 * 대화 맥락에 특정 농장이 있을 때(animal/farm) 그 농장의 번식 설정을 로드한다.
 * animal 해석 경로와 동일하게 목장 고유 발정재귀일·수정적기 등을 프롬프트에 주입하기 위함.
 * 실패는 비치명적 — undefined 반환 시 프롬프트는 설정 블록 없이 진행한다.
 */
async function loadFarmBreedingSettings(
  context: ChatContext,
): Promise<FarmBreedingSettings | undefined> {
  if (context.type !== 'animal' && context.type !== 'farm') return undefined;
  const farmId = context.profile.farmId;
  if (!farmId) return undefined;
  try {
    return await getFarmBreedingSettings(farmId);
  } catch (err) {
    logger.warn({ err, farmId }, '[Chat] 목장 번식 설정 로드 실패 — 주입 생략');
    return undefined;
  }
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

  // 2. 레이블 컨텍스트 조회 (계층 집단지성 — 실패 무시)
  let labelContext: string | undefined;
  try {
    if (context.type === 'animal' && context.profile.activeEvents.length > 0) {
      const primaryEvent = context.profile.activeEvents[0];
      if (primaryEvent) {
        const hierarchical = await getHierarchicalLabelContext(primaryEvent.type, farmId);
        const formatted = formatHierarchicalLabelContext(hierarchical, primaryEvent.type);
        if (formatted) {
          labelContext = formatted;
        }
      }
    }
  } catch {
    // 레이블 조회 실패는 비치명적
  }
  // 미사용 import 제거 방지 — getLabelContextForEventType/formatLabelContext는 다른 모듈에서 호출 가능
  void getLabelContextForEventType;
  void formatLabelContext;

  // 3. 프롬프트 빌드 (목장 번식 설정 주입 — animal/farm 맥락일 때만)
  const farmBreedingSettings = await loadFarmBreedingSettings(context);
  const prompt = buildConversationPrompt(
    question, role, context, conversationHistory, { labelContext, farmBreedingSettings },
  );

  // 3. 역할별 톤 설정
  // (환각 방지 가드는 SYSTEM_PROMPT 본문에서 이미 강제 — JSON 경로는 data_references 필드 의무만 추가)
  const roleTone = getRoleTone(role);
  const systemPrompt = `${SYSTEM_PROMPT}\n\n## 톤 설정\n${roleTone.systemAddendum}\n\n## JSON 응답 규칙\n- answer에 등장한 모든 수치·동물번호·농장명을 data_references에 출처와 함께 기록하세요 (예: "423번 체온 41.2°C — query_animal", "전국 발열률 0.8% — query_quarantine_dashboard").\n- 컨텍스트/도구 결과에 없는 값은 절대 답변에 넣지 마세요.${buildUiLangDirective(uiLang)}`;

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

  // 컨텍스트 + 농장 학습 스냅샷을 병렬로 — 첫 토큰 지연을 최대한 줄이기 위함
  // (resolveContext는 DB N건 + 농장 스냅샷도 chat_conversations 500건이라 순차면 합산 지연)
  let context: Awaited<ReturnType<typeof resolveContext>>['context'];
  let snapshotPromise: Promise<Awaited<ReturnType<typeof getFarmLearningSnapshot>>> | null = null;
  if (farmId) {
    snapshotPromise = getFarmLearningSnapshot(farmId, 30).catch(() => null);
  }
  try {
    const resolved = await resolveContext(
      question, farmId, animalId, role, dashboardContext,
    );
    context = resolved.context;
  } catch (err) {
    logger.warn({ err, farmId, animalId }, '[Chat] Stream context resolution failed — using general');
    context = { type: 'general' } as typeof context;
  }

  // 레이블 컨텍스트 — 계층 집계 (이 농장 → 이 시도 → 국가).
  // 데이터가 쌓일수록 그 지역·그 농장에 특화된 답변이 나오도록 4단계로 조회.
  let labelContext: string | undefined;
  try {
    if (context.type === 'animal' && context.profile.activeEvents.length > 0) {
      const primaryEvent = context.profile.activeEvents[0];
      if (primaryEvent) {
        const hierarchical = await getHierarchicalLabelContext(primaryEvent.type, farmId);
        const formatted = formatHierarchicalLabelContext(hierarchical, primaryEvent.type);
        if (formatted) {
          labelContext = formatted;
        }
      }
    }

    // 농장 단위 최근 학습 패턴 — 후보 이벤트 타입 중 데이터가 있는 첫 항목.
    // 계층 집계로 농장 → 시도 → 국가 모두 포함.
    if (!labelContext && farmId) {
      const commonTypes = ['temperature_high', 'rumination_decrease', 'estrus', 'health_general'];
      const results = await Promise.all(
        commonTypes.map((t) => getHierarchicalLabelContext(t, farmId).catch(() => null)),
      );
      for (let i = 0; i < commonTypes.length; i++) {
        const ctx = results[i];
        if (!ctx) continue;
        const formatted = formatHierarchicalLabelContext(ctx, commonTypes[i]!);
        if (formatted) {
          labelContext = formatted;
          break;
        }
      }
    }

    // 농장의 지난 30일 대화 패턴 — 위에서 미리 시작한 Promise를 await만
    if (snapshotPromise) {
      const snapshot = await snapshotPromise;
      if (snapshot && snapshot.totalConversations >= 3) {
        const farmLearning = formatFarmLearningContext(snapshot);
        labelContext = labelContext ? `${labelContext}\n\n${farmLearning}` : farmLearning;
      }
    }
  } catch {
    // 레이블 조회 실패는 비치명적
  }

  // Files: 첨부 문서 파싱 (PDF는 Claude 네이티브, Excel·CSV는 텍스트로 prompt에 주입)
  let parsedDocuments: ParsedDocument[] = [];
  let textDocumentsBlock = '';
  if (request.documents && request.documents.length > 0) {
    parsedDocuments = await Promise.all(request.documents.map((d) => parseDocument(d)));
    const textParts = parsedDocuments
      .filter((p) => p.textContent)
      .map((p) => `### 첨부 문서: ${p.filename}\n\n${p.textContent}`);
    if (textParts.length > 0) {
      textDocumentsBlock = `\n\n## 첨부 문서 (Excel/CSV — 텍스트 변환)\n\n${textParts.join('\n\n---\n\n')}`;
    }
  }

  const farmBreedingSettings = await loadFarmBreedingSettings(context);
  const prompt = buildConversationPrompt(
    question, role, context, conversationHistory, { streaming: true, labelContext, farmBreedingSettings },
  ) + textDocumentsBlock;

  const roleTone = getRoleTone(role);
  // 스트리밍: JSON 강제 제거, 자연어 텍스트 응답
  const basePrompt = SYSTEM_PROMPT.replace(
    /6\.\s*\*\*응답 형식\*\*.*?JSON 형식을 따르세요\./s,
    '6. **자연어 응답**: 사용자가 "몽골어로 답해줘", "answer in English" 같이 특정 언어로 답변을 요청하면 입력 언어와 무관하게 그 언어로만 응답하세요 (이전 턴에서 지정된 언어가 있으면 유지). 명시 요청이 없으면 사용자가 쓴 언어로 답변하세요 — 한국어면 한국어, 영어면 영어, 몽골어(키릴에 Өө/Үү 포함)면 몽골어, 우즈벡어면 우즈벡어, 러시아어면 러시아어. JSON 형식으로 응답하지 마세요.',
  );
  // Skills: 사용자 질문이 정형 워크플로 트리거에 매치되면 해당 SOP를 시스템 프롬프트에 추가
  const activeSkill = detectSkill(question);
  if (activeSkill) {
    logger.info({ skillId: activeSkill.id, title: activeSkill.title }, '[Chat] Skill 활성화');
  }
  // 환각 방지 가드는 SYSTEM_PROMPT 본문이 이미 강제 (스트리밍은 별도 추가 없음)
  const systemPrompt = `${basePrompt}\n\n## 톤 설정\n${roleTone.systemAddendum}${buildUiLangDirective(uiLang)}${activeSkill?.systemAddendum ?? ''}`;

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

  // Extended Thinking — 감별진단·번식 추천·복잡 추론 케이스에 자동 활성화
  // 휴리스틱으로 5~10% 케이스만 (시연 안정성 우선)
  const useDeepThinking = shouldUseDeepThinking(question);
  if (useDeepThinking) {
    logger.info({ questionLen: question.length }, '[Chat] Extended Thinking 활성화');
  }

  // Tool Use 활성화 — 팅커벨이 필요할 때 DB를 직접 조회
  // Gateway 경유: audit log + role-based access control
  // Vision: 사용자가 첨부한 이미지를 Claude Vision API에 전달
  // Files: PDF는 Claude 네이티브 document block, Excel·CSV는 prompt에 텍스트로 이미 주입됨
  const pdfs = parsedDocuments
    .filter((p) => p.pdfBase64)
    .map((p) => ({ data: p.pdfBase64!, filename: p.filename }));

  await callClaudeForChatWithTools(
    systemPrompt,
    prompt,
    wrappedCallbacks,
    {
      userId: request.userId,
      role,
      farmId: farmId ?? undefined,
    },
    { useDeepThinking, images: request.images, pdfs: pdfs.length > 0 ? pdfs : undefined },
  );
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
