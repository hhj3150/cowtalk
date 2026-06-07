// 수의사 진료센터 2단계 — 대화형 현장 진료기록 구조화 서비스
// 수의사가 말한/입력한 자연어 진료 내용 → 구조화된 진료차트 초안으로 변환.
// 핵심 안전 원칙: AI는 "정리/초안"만 한다. 최종 진단·처방·투약·휴약·방역은 수의사가 확인 후 확정.

import { callClaudeForAnalysis, isClaudeAvailable } from '../../ai-brain/claude-client.js';
import { buildClinicalContext, type ClinicalContext } from './clinical-context.service.js';
import { logger } from '../../lib/logger.js';

export const CONVERSATION_NOTE_DISCLAIMER =
  'AI가 정리한 진료기록 초안이며, 최종 진단·처방·투약은 담당 수의사가 확인 후 확정해야 합니다.';

export interface StructuredNote {
  animal_identifier: string;
  visit_reason: string;
  chief_complaint: string;
  farmer_statement: string;
  physical_exam: string;
  clinical_findings: string;
  differential_diagnosis: string;
  final_diagnosis: string;
  treatment: string;
  medication: string;
  prescription: string;
  withdrawal_period: string;
  prognosis: string;
  follow_up_date: string;
  farmer_instruction: string;
  quarantine_required: boolean;
  document_suggestions: string[];
  missing_required_fields: string[];
  safety_warnings: string[];
}

export interface ConversationNoteResult {
  structured_note: StructuredNote;
  source_separation: {
    veterinarian_spoken_content: Record<string, unknown>;
    cowtalk_auto_data: Record<string, unknown>;
    ai_suggestions: Record<string, unknown>;
  };
  ai_disclaimer: string;
}

// clinical-context를 Claude에 넘길 간결한 텍스트 요약으로 압축 (토큰 절약 + 환각 방지)
function summarizeContext(ctx: ClinicalContext): string {
  const a = ctx.animal_snapshot;
  const r = ctx.reproduction_snapshot;
  const s = ctx.sensor_snapshot;
  const w = ctx.current_withdrawal_status;
  const lines: string[] = [];
  lines.push(`개체: ${String(a['ear_tag_number'] ?? '')}번, ${String(a['breed'] ?? '')}, ${String(a['parity'] ?? '')}산, 착유 ${String(a['days_in_milk'] ?? '?')}일`);
  if (r['days_postpartum'] != null) lines.push(`분만 후 경과일: ${String(r['days_postpartum'])}일`);
  if (r['pregnancy_check_result']) lines.push(`최근 임신감정: ${String(r['pregnancy_check_result'])}`);
  lines.push(`센서: 체온 ${String(s['temperature'] ?? '?')}(${String(s['temperature_7d_trend'] ?? '')}), 반추 ${String(s['rumination'] ?? '?')}(${String(s['rumination_trend'] ?? '')}), 활동 ${String(s['activity'] ?? '?')}`);
  if (s['alert_type']) lines.push(`센서 알림: ${String(s['alert_type'])} (${String(s['alert_level'] ?? '')})`);
  if (w['in_withdrawal'] === true) {
    const list = (w['active_withdrawals'] as Array<Record<string, unknown>> | undefined) ?? [];
    lines.push(`휴약기간 진행 중: ${list.map((x) => `${String(x['drug'])} ${String(x['days_remaining'])}일 남음`).join(', ')}`);
  }
  const di=(ctx.health_history_snapshot['previous_diagnoses'] as Array<Record<string, unknown>> | undefined) ?? [];
  if (di.length > 0) lines.push(`과거 진단: ${di.slice(0, 5).map((d) => String(d['diagnosis'])).join(', ')}`);
  return lines.join('\n');
}

function buildPrompt(rawNote: string, contextSummary: string): string {
  return `당신은 한국 대동물(소) 수의사의 현장 진료 대화를 구조화된 진료차트 초안으로 정리하는 보조자입니다.

## 절대 원칙 (안전)
1. 당신은 "정리"와 "초안 작성"만 합니다. 진단을 새로 만들거나 확정하지 마세요.
2. 수의사가 말하지 않은 진단명·약물·용량을 지어내지 마세요.
3. 추론·제안은 ai_suggestions에만 넣고, structured_note의 final_diagnosis/treatment/medication에는 수의사가 명시한 것만 넣으세요.
4. CowTalk 자동 데이터(센서·번식 등)는 cowtalk_auto_data에 분리해 기록하세요.
5. 누락된 필수 항목(최종진단, 휴약기간 등)은 missing_required_fields에 나열하세요.
6. 약물 사용이 언급되면 휴약기간 확인 필요를 safety_warnings에 넣으세요.

## 수의사가 말한/입력한 내용 (1차 정보원)
${rawNote}

## CowTalk 자동 호출 데이터 (참고용 — 진단 근거가 아니라 맥락)
${contextSummary}

## 출력 (JSON만)
\`\`\`json
{
  "structured_note": {
    "animal_identifier": "", "visit_reason": "", "chief_complaint": "", "farmer_statement": "",
    "physical_exam": "", "clinical_findings": "", "differential_diagnosis": "", "final_diagnosis": "",
    "treatment": "", "medication": "", "prescription": "", "withdrawal_period": "", "prognosis": "",
    "follow_up_date": "", "farmer_instruction": "", "quarantine_required": false,
    "document_suggestions": ["medical_record", "prescription"],
    "missing_required_fields": [], "safety_warnings": []
  },
  "source_separation": {
    "veterinarian_spoken_content": { "...수의사가 직접 말한 사실들": "" },
    "cowtalk_auto_data": { "...센서/번식 등 자동 데이터": "" },
    "ai_suggestions": { "...AI가 제안한 감별진단/추가확인": "" }
  }
}
\`\`\`
document_suggestions는 medical_record/prescription/diagnosis_certificate/treatment_certificate/death_certificate/vaccination_certificate 중 해당되는 것만.
수의사가 말하지 않은 값은 빈 문자열로 두세요.`;
}

const EMPTY_NOTE: StructuredNote = {
  animal_identifier: '', visit_reason: '', chief_complaint: '', farmer_statement: '',
  physical_exam: '', clinical_findings: '', differential_diagnosis: '', final_diagnosis: '',
  treatment: '', medication: '', prescription: '', withdrawal_period: '', prognosis: '',
  follow_up_date: '', farmer_instruction: '', quarantine_required: false,
  document_suggestions: [], missing_required_fields: [], safety_warnings: [],
};

export function coerceNote(raw: unknown): StructuredNote {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (k: keyof StructuredNote): string => (typeof o[k] === 'string' ? (o[k] as string) : '');
  const arr = (k: keyof StructuredNote): string[] => (Array.isArray(o[k]) ? (o[k] as unknown[]).map(String) : []);
  return {
    ...EMPTY_NOTE,
    animal_identifier: str('animal_identifier'),
    visit_reason: str('visit_reason'),
    chief_complaint: str('chief_complaint'),
    farmer_statement: str('farmer_statement'),
    physical_exam: str('physical_exam'),
    clinical_findings: str('clinical_findings'),
    differential_diagnosis: str('differential_diagnosis'),
    final_diagnosis: str('final_diagnosis'),
    treatment: str('treatment'),
    medication: str('medication'),
    prescription: str('prescription'),
    withdrawal_period: str('withdrawal_period'),
    prognosis: str('prognosis'),
    follow_up_date: str('follow_up_date'),
    farmer_instruction: str('farmer_instruction'),
    quarantine_required: o['quarantine_required'] === true,
    document_suggestions: arr('document_suggestions'),
    missing_required_fields: arr('missing_required_fields'),
    safety_warnings: arr('safety_warnings'),
  };
}

export async function structureConversationNote(input: {
  farmId: string;
  animalId: string;
  rawNote: string;
}): Promise<ConversationNoteResult | null> {
  if (!isClaudeAvailable()) {
    logger.warn('[VetConversation] Claude unavailable — cannot structure note');
    return null;
  }
  const ctx = await buildClinicalContext(input.farmId, input.animalId);
  if (!ctx) return null;

  const prompt = buildPrompt(input.rawNote, summarizeContext(ctx));
  const result = await callClaudeForAnalysis(prompt, { useDeepModel: false });
  if (!result?.parsed) {
    logger.warn('[VetConversation] structuring returned no result');
    return null;
  }

  const parsed = result.parsed as Record<string, unknown>;
  const sep = (parsed['source_separation'] ?? {}) as Record<string, unknown>;
  const note = coerceNote(parsed['structured_note']);

  logger.info({ farmId: input.farmId, animalId: input.animalId, diagnosis: note.final_diagnosis }, '[VetConversation] 진료기록 초안 생성');

  return {
    structured_note: note,
    source_separation: {
      veterinarian_spoken_content: (sep['veterinarian_spoken_content'] as Record<string, unknown>) ?? {},
      cowtalk_auto_data: (sep['cowtalk_auto_data'] as Record<string, unknown>) ?? {},
      ai_suggestions: (sep['ai_suggestions'] as Record<string, unknown>) ?? {},
    },
    ai_disclaimer: CONVERSATION_NOTE_DISCLAIMER,
  };
}
