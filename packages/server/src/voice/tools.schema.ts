// 음성 전용 도구 스키마 — 지시서 §5.
//
// 기존 25종 도구를 재작성하지 않는다. 음성 대화에 맞는 **얇은 래퍼**만 노출한다.
// 이유 둘:
//   1) 음성은 컨텍스트가 비싸다. 도구가 많으면 모델이 고르는 데 토큰과 시간을 쓴다.
//   2) 반환값이 길면 첫 문장까지 오래 걸린다. 원시 시계열은 절대 반환하지 않는다.
//
// 스키마 파일을 실행 코드(tools.ts)와 분리한 것도 지시서 요구사항이다.

import type Anthropic from '@anthropic-ai/sdk';

/** 개체번호는 문자열로 받는다 — 앞자리 0이 있는 관리번호가 실제로 존재한다. */
const ANIMAL_ID = {
  type: 'string' as const,
  description: '개체 관리번호 또는 이력제번호. 사용자에게 복창 확인한 번호만 넣는다.',
};

export const VOICE_TOOLS: readonly Anthropic.Messages.Tool[] = [
  {
    name: 'get_animal_status',
    description:
      '개체 한 마리의 현재 상태를 한 문장 분량으로 요약한다. 체온·반추·활동량·최근 알림. ' +
      '"1877번 어때", "체온 얼마야" 같은 질문에 쓴다. 개체번호를 복창 확인한 뒤에만 호출한다.',
    input_schema: {
      type: 'object',
      properties: { animal_id: ANIMAL_ID },
      required: ['animal_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_alerts',
    description:
      '농장의 현재 알림 목록을 건수와 상위 3건만 반환한다. "오늘 뭐 있어", "알림 뭐야"에 쓴다.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['health', 'estrus', 'calving', 'environment', 'all'],
          description: '미지정 시 all',
        },
        since_hours: { type: 'number', description: '최근 N시간. 기본 24' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'get_estrus_candidates',
    description:
      '오늘 발정로 판단된 개체와 권장 수정 시각을 반환한다. "수정할 소 있어", "발정 몇 마리야"에 쓴다.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'get_barn_environment',
    description:
      '축사 환경과 더위지수(THI), 열스트레스 권고를 반환한다. "덥나", "환경 어때"에 쓴다.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'propose_action',
    description:
      '처치·기록을 제안 상태로 만든다. 실행되지 않는다. 사용자에게 되읽어 확답을 받기 위한 단계다. ' +
      '반환된 action_id 를 확답 후 confirm_action 에 넘긴다.',
    input_schema: {
      type: 'object',
      properties: {
        animal_id: ANIMAL_ID,
        action: {
          type: 'string',
          description: '무엇을 할지 자연어 한 문장. 예: "유방염 치료 기록, 세프티오퍼 3일"',
        },
        kind: {
          type: 'string',
          enum: ['treatment', 'insemination', 'note'],
          description: '기록 종류',
        },
      },
      required: ['animal_id', 'action', 'kind'],
      additionalProperties: false,
    },
  },
  {
    name: 'confirm_action',
    description:
      '되읽어 확답을 받은 제안을 실제로 실행한다. 사용자가 명시적으로 동의한 경우에만 호출한다. ' +
      '동의 없이 호출하면 안 된다.',
    input_schema: {
      type: 'object',
      properties: { action_id: { type: 'string', description: 'propose_action 이 반환한 ID' } },
      required: ['action_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'log_note',
    description: '개체에 대한 자유 메모를 남긴다. 진단·처방이 아닌 관찰 기록용.',
    input_schema: {
      type: 'object',
      properties: { animal_id: ANIMAL_ID, text: { type: 'string', description: '메모 내용' } },
      required: ['animal_id', 'text'],
      additionalProperties: false,
    },
  },
];

/** 조회 전용 도구 — 확답 없이 바로 실행해도 되는 것들 */
export const READ_ONLY_VOICE_TOOLS: readonly string[] = [
  'get_animal_status',
  'list_alerts',
  'get_estrus_candidates',
  'get_barn_environment',
];
