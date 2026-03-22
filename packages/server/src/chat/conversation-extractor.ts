// 대화-즉-기록: AI 대화에서 구조화 데이터 자동 추출
// 스트리밍 완료 후 별도 Claude 호출로 대화 내용 분석
// 사용자가 언급한 수정/분만/치료 등을 구조화 데이터로 추출

import { callClaudeForAnalysis } from '../ai-brain/claude-client.js';
import { logger } from '../lib/logger.js';
import type { ExtractedRecord } from '@cowtalk/shared';

// ── 추출 프롬프트 ──

const EXTRACTION_PROMPT = `당신은 한국 축산 현장 대화에서 구조화된 기록을 추출하는 전문가입니다.

## 역할
사용자와 AI 어시스턴트의 대화 내용을 분석하여, 사용자가 보고한 **실제 수행한 조치나 관찰 사항**을 구조화된 JSON으로 추출합니다.

## 중요 규칙
1. 사용자가 **실제로 수행했거나 관찰한 사실**만 추출합니다
2. AI의 추천/제안은 추출하지 않습니다
3. 질문이나 미래 계획은 추출하지 않습니다
4. 대화에 actionable 기록이 없으면 hasActionableEvent: false를 반환합니다

## 추출 가능한 이벤트 유형

### insemination (수정)
- semenId: 정액 번호/이름 (예: "888", "맥도날드", "한우 KPN")
- inseminationTime: 수정 시각 (예: "08:00", "아침")
- estrusLevel: 발정 강도 (strong/medium/weak)
- inseminatorName: 수정사 이름
- method: 인공수정(AI), 자연교배 등

### calving (분만)
- calfSex: 송아지 성별 (male/female/unknown)
- birthType: 분만 유형 (normal/dystocia/cesarean)
- calfStatus: 송아지 상태 (alive/stillborn/weak)
- calfWeight: 송아지 체중 (kg)
- placentaExpelled: 태반 배출 여부 (true/false)
- calvingTime: 분만 시각

### treatment (치료/투약)
- diagnosis: 진단명
- medication: 약물명
- dosage: 용량
- route: 투여 경로 (IV, IM, SC, 경구 등)
- duration: 투약 기간
- withdrawalPeriod: 출하 제한 기간
- treatedBy: 수의사

### mastitis (유방염)
- affectedQuarter: 감염 유방 (LF, RF, LR, RR, 좌전, 우전, 좌후, 우후)
- severity: 중증도 (mild/moderate/severe)
- cmtResult: CMT 검사 결과
- medication: 사용 약물
- milkDiscarded: 우유 폐기 여부

### hoof_treatment (발굽 치료)
- affectedLeg: 이환지 (앞왼, 앞오른, 뒤왼, 뒤오른)
- condition: 질환 (제엽염, 백선, 과장, 지간부식 등)
- treatment: 치료 내용
- lameness_score: 파행 점수 (1-5)

### vaccination (예방접종)
- vaccineType: 백신 종류
- manufacturer: 제조사
- batchNumber: 로트번호
- nextDueDate: 다음 접종일

### abortion (유산)
- gestationDays: 임신 일수
- possibleCause: 추정 원인
- fetusCondition: 태아 상태
- labSampleTaken: 검체 채취 여부

### clinical_exam, behavior_change, feed_change, general_observation
- temperature: 체온
- bodyConditionScore: 체형점수 (1-5)
- weight: 체중 (kg)
- notes: 관찰 내용

## 한국어 축산 용어 매핑
- "정액 888" → semenId: "888"
- "아침 8시에 수정" → inseminationTime: "08:00"
- "발정이 중간" → estrusLevel: "medium"
- "암송아지" → calfSex: "female"
- "난산" → birthType: "dystocia"
- "태반 나왔어" → placentaExpelled: true
- "좌후 유방" → affectedQuarter: "LR"
- "세파졸린 주사" → medication: "세파졸린", route: "IM"
- "3일분" → duration: "3일"

## 출력 형식 (JSON)
\`\`\`json
{
  "hasActionableEvent": true,
  "records": [
    {
      "eventType": "insemination",
      "confidence": 0.95,
      "summary": "정액 888로 08:00 수정, 발정 중간",
      "structuredData": {
        "type": "insemination",
        "data": {
          "semenId": "888",
          "inseminationTime": "08:00",
          "estrusLevel": "medium"
        }
      },
      "missingFields": ["inseminatorName"],
      "rawExcerpt": "정액 888로 아침 8시에 수정했어 발정상태는 중간정도였어"
    }
  ]
}
\`\`\`

여러 이벤트가 대화에 포함된 경우 records 배열에 모두 포함합니다.
actionable 이벤트가 없으면: {"hasActionableEvent": false, "records": []}`;

// ── 추출 함수 ──

export async function extractRecordsFromConversation(
  messages: readonly { readonly role: string; readonly content: string }[],
): Promise<readonly ExtractedRecord[]> {
  if (messages.length === 0) return [];

  // 대화 내용을 텍스트로 직렬화
  const conversationText = messages
    .map((m) => `[${m.role === 'user' ? '사용자' : 'AI'}]: ${m.content}`)
    .join('\n\n');

  const prompt = `## 분석할 대화 내용\n\n${conversationText}\n\n위 대화에서 사용자가 실제로 수행한 조치나 관찰한 사실을 추출하세요. JSON으로 응답합니다.`;

  try {
    const result = await callClaudeForAnalysis(
      `${EXTRACTION_PROMPT}\n\n${prompt}`,
      { useDeepModel: false }, // Sonnet 사용 (빠른 추출)
    );

    if (!result?.parsed) {
      logger.warn('Conversation extraction returned no result');
      return [];
    }

    const parsed = result.parsed as {
      hasActionableEvent?: boolean;
      records?: readonly ExtractedRecord[];
    };

    if (!parsed.hasActionableEvent || !parsed.records?.length) {
      return [];
    }

    // confidence 0.5 이하는 제외 (확신 없는 추출 방지)
    const validRecords = parsed.records.filter(
      (r) => r.confidence > 0.5 && r.eventType && r.structuredData,
    );

    logger.info(
      { total: parsed.records.length, valid: validRecords.length },
      'Conversation records extracted',
    );

    return validRecords;
  } catch (err) {
    logger.error({ err }, 'Failed to extract records from conversation');
    return [];
  }
}
