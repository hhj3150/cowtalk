// 팅커벨 자동 강화 학습 시스템
// 대화에서 진단/치료/번식/결과 신호를 자동 추출 → DB 기록 → AI 강화
// 원칙: 대화가 곧 기록. 사용자는 자연스럽게 말하면 됨.

import { getDb } from '../config/database.js';
import { chatConversations, animalEvents, clinicalObservations } from '../db/schema.js';
import { logger } from '../lib/logger.js';

// ── 학습 신호 타입 ──

export interface LearningSignal {
  readonly type: 'diagnosis' | 'treatment' | 'breeding' | 'outcome' | 'calving' | 'observation';
  readonly value: string;
  readonly confidence: number;
  readonly details: Record<string, unknown>;
}

// ── 한국어 패턴 사전 ──

const DIAGNOSIS_PATTERNS: ReadonlyArray<{ pattern: RegExp; diagnosis: string }> = [
  { pattern: /유방염/i, diagnosis: '유방염' },
  { pattern: /케토시스|케토/i, diagnosis: '케토시스' },
  { pattern: /유열|밀크피버/i, diagnosis: '유열' },
  { pattern: /폐렴/i, diagnosis: '폐렴' },
  { pattern: /설사/i, diagnosis: '설사' },
  { pattern: /파행|절뚝/i, diagnosis: '파행' },
  { pattern: /자궁염|자궁내막염/i, diagnosis: '자궁염' },
  { pattern: /산욕열/i, diagnosis: '산욕열' },
  { pattern: /과산증|산증/i, diagnosis: '과산증' },
  { pattern: /식욕부진|밥.*안.*먹/i, diagnosis: '식욕부진' },
  { pattern: /브루셀라/i, diagnosis: '브루셀라' },
  { pattern: /구제역/i, diagnosis: '구제역' },
  { pattern: /결핵/i, diagnosis: '결핵' },
];

const TREATMENT_PATTERNS: ReadonlyArray<{ pattern: RegExp; extract: (match: string) => Record<string, unknown> }> = [
  {
    pattern: /(테라마이신|페니실린|겐타마이신|세파졸린|엔로플록사신|타이로신|옥시테트라|암피실린|스트렙토마이신|덱사메타손|멜록시캄|플루닉신|바나민|카토살|칼포민|프로필렌글리콜)\s*(\d+)\s*(ml|미리|밀리|cc|mg|그람|g)/i,
    extract: (match: string) => {
      const m = match.match(/([\w가-힣]+)\s*(\d+)\s*(ml|미리|밀리|cc|mg|그람|g)/i);
      return m ? { name: m[1], dose: `${m[2]}${m[3]}` } : {};
    },
  },
];

const BREEDING_PATTERNS: ReadonlyArray<{ pattern: RegExp; eventType: string; details: Record<string, unknown> }> = [
  { pattern: /수정\s*했|정액\s*했|씨\s*넣/i, eventType: 'insemination', details: {} },
  { pattern: /임신\s*(확인|확정|양성|맞)/i, eventType: 'pregnancy_check', details: { result: 'pregnant' } },
  { pattern: /임신\s*(아|안|부정|음성|안됐)/i, eventType: 'pregnancy_check', details: { result: 'open' } },
  { pattern: /발정\s*(맞|확인|왔)/i, eventType: 'observation', details: { note: '발정 확인' } },
];

const CALVING_PATTERNS: ReadonlyArray<{ pattern: RegExp; details: Record<string, unknown> }> = [
  { pattern: /암놈.*태어|암송아지.*낳|암.*분만/i, details: { calfSex: 'female', calfStatus: 'alive' } },
  { pattern: /수놈.*태어|수송아지.*낳|수.*분만/i, details: { calfSex: 'male', calfStatus: 'alive' } },
  { pattern: /분만\s*(했|완료|끝)|송아지.*낳/i, details: { calfSex: 'unknown', calfStatus: 'alive' } },
  { pattern: /사산|죽은.*새끼|사.*태어/i, details: { calfSex: 'unknown', calfStatus: 'stillborn' } },
];

const OUTCOME_PATTERNS: ReadonlyArray<{ pattern: RegExp; outcome: string }> = [
  { pattern: /나았|완치|회복.*됐|정상.*돌아/i, outcome: 'recovered' },
  { pattern: /호전|좋아지|나아지/i, outcome: 'improving' },
  { pattern: /악화|심해|더.*나빠/i, outcome: 'worsened' },
  { pattern: /변화.*없|그대로|차도.*없/i, outcome: 'unchanged' },
  { pattern: /폐사|죽|사망/i, outcome: 'dead' },
  { pattern: /도태|출하|팔/i, outcome: 'culled' },
];

const DURATION_PATTERN = /(\d+)\s*일\s*(간|동안)?/;

// ── 학습 신호 추출 ──

export function extractLearningSignals(text: string): readonly LearningSignal[] {
  const signals: LearningSignal[] = [];

  // 진단 감지
  for (const { pattern, diagnosis } of DIAGNOSIS_PATTERNS) {
    if (pattern.test(text)) {
      signals.push({
        type: 'diagnosis',
        value: diagnosis,
        confidence: 0.85,
        details: { diagnosis },
      });
    }
  }

  // 치료 감지
  for (const { pattern, extract } of TREATMENT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const medication = extract(match[0]);
      const durationMatch = text.match(DURATION_PATTERN);
      signals.push({
        type: 'treatment',
        value: `${String(medication.name ?? '약물')} ${String(medication.dose ?? '')}`,
        confidence: 0.9,
        details: {
          medications: [medication],
          durationDays: durationMatch ? Number(durationMatch[1]) : undefined,
        },
      });
    }
  }

  // 번식 감지
  for (const { pattern, eventType, details } of BREEDING_PATTERNS) {
    if (pattern.test(text)) {
      signals.push({
        type: 'breeding',
        value: eventType,
        confidence: 0.85,
        details,
      });
      break; // 하나만
    }
  }

  // 분만 감지
  for (const { pattern, details } of CALVING_PATTERNS) {
    if (pattern.test(text)) {
      signals.push({
        type: 'calving',
        value: 'calving',
        confidence: 0.9,
        details,
      });
      break;
    }
  }

  // 결과/예후 감지
  for (const { pattern, outcome } of OUTCOME_PATTERNS) {
    if (pattern.test(text)) {
      signals.push({
        type: 'outcome',
        value: outcome,
        confidence: 0.8,
        details: { outcome },
      });
      break;
    }
  }

  return signals;
}

// ── 대화 저장 ──

export async function saveChatConversation(input: {
  readonly userId: string;
  readonly role: string;
  readonly animalId: string | null;
  readonly farmId: string | null;
  readonly question: string;
  readonly answer: string;
  readonly contextType: string;
}): Promise<void> {
  const db = getDb();
  const signals = extractLearningSignals(input.question);

  try {
    await db.insert(chatConversations).values({
      userId: input.userId,
      role: input.role,
      animalId: input.animalId,
      farmId: input.farmId,
      question: input.question,
      answer: input.answer,
      contextType: input.contextType,
      learningSignals: signals as unknown as Record<string, unknown>,
    });

    // 학습 신호가 있으면 자동 기록
    if (signals.length > 0 && input.animalId) {
      await processLearningSignals(signals, input.animalId, input.farmId, input.userId);
    }

    if (signals.length > 0) {
      logger.info(
        { signals: signals.map((s) => `${s.type}:${s.value}`), animalId: input.animalId },
        '[ChatLearner] Learning signals detected',
      );
    }
  } catch (err) {
    // 대화 저장 실패가 응답을 막으면 안 됨
    logger.warn({ err }, '[ChatLearner] Failed to save conversation');
  }
}

// ── 학습 신호 → 이벤트 자동 기록 ──

async function processLearningSignals(
  signals: readonly LearningSignal[],
  animalId: string,
  farmId: string | null,
  userId: string,
): Promise<void> {
  const db = getDb();

  for (const signal of signals) {
    try {
      switch (signal.type) {
        case 'treatment': {
          if (!farmId) break;
          const meds = signal.details.medications as ReadonlyArray<Record<string, unknown>> | undefined;
          await db.insert(animalEvents).values({
            animalId,
            farmId,
            eventType: 'treatment',
            eventDate: new Date(),
            recordedBy: userId,
            recordedByName: null,
            details: {
              diagnosis: signals.find((s) => s.type === 'diagnosis')?.value ?? '팅커벨 대화 기록',
              medications: meds ?? [],
              source: 'tinkerbell_chat',
            },
            notes: `[팅커벨 자동기록] ${signal.value}`,
          });
          break;
        }

        case 'calving': {
          if (!farmId) break;
          await db.insert(animalEvents).values({
            animalId,
            farmId,
            eventType: 'calving',
            eventDate: new Date(),
            recordedBy: userId,
            recordedByName: null,
            details: { ...signal.details, source: 'tinkerbell_chat' },
            notes: '[팅커벨 자동기록] 분만',
          });
          break;
        }

        case 'breeding': {
          if (!farmId) break;
          await db.insert(animalEvents).values({
            animalId,
            farmId,
            eventType: signal.value,
            eventDate: new Date(),
            recordedBy: userId,
            recordedByName: null,
            details: { ...signal.details, source: 'tinkerbell_chat' },
            notes: `[팅커벨 자동기록] ${signal.value}`,
          });
          break;
        }

        case 'diagnosis': {
          if (!farmId) break;
          await db.insert(clinicalObservations).values({
            animalId,
            farmId,
            observationType: 'general_note',
            description: `진단: ${signal.value}`,
            recordedBy: userId,
            observedAt: new Date(),
            conversationSummary: `팅커벨 대화에서 자동 추출: ${signal.value}`,
          });
          break;
        }

        // outcome은 기존 event_labels/label_follow_ups에 연결이 필요하므로 일단 로깅만
        case 'outcome': {
          logger.info(
            { outcome: signal.value, animalId },
            '[ChatLearner] Outcome signal detected — will link to existing labels in future',
          );
          break;
        }
      }
    } catch (err) {
      logger.warn({ err, signal }, '[ChatLearner] Failed to process learning signal');
    }
  }
}
