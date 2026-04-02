// 팅커벨 AI 도구 정의 — Claude tool_use용 스키마
// Anthropic SDK Tool 타입에 맞춰 정의

import type Anthropic from '@anthropic-ai/sdk';

export const TINKERBELL_TOOLS: readonly Anthropic.Tool[] = [
  {
    name: 'query_animal',
    description: '개체 정보 조회. 귀번호(earTag), 이력번호(traceId), 또는 animalId로 검색. 품종, 산차, 착유일수, 농장, 번식 상태 등 기본 프로필을 반환한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        earTag: { type: 'string', description: '관리번호 (예: "423", "1052")' },
        traceId: { type: 'string', description: '이력제 12자리 번호 (예: "002132665191")' },
        animalId: { type: 'string', description: 'DB 고유 ID (UUID)' },
      },
    },
  },
  {
    name: 'query_animal_events',
    description: '개체의 최근 이벤트 이력 조회. 발정, 수정, 임신감정, 분만, 건강 알림 등 시간순 이벤트 목록을 반환한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        animalId: { type: 'string', description: '동물 ID (필수)' },
        eventTypes: {
          type: 'array',
          items: { type: 'string' },
          description: '필터할 이벤트 유형 (예: ["estrus", "insemination", "pregnancy_check"]). 생략 시 전체.',
        },
        limit: { type: 'number', description: '반환할 최대 이벤트 수 (기본 20)' },
      },
      required: ['animalId'],
    },
  },
  {
    name: 'query_farm_summary',
    description: '농장 요약 정보 조회. 농장명, 두수, 활성 알림 수, 번식 KPI(수태율, 발정탐지율)를 반환한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        farmId: { type: 'string', description: '농장 ID' },
        farmName: { type: 'string', description: '농장 이름 (부분 일치 검색)' },
      },
    },
  },
  {
    name: 'query_breeding_stats',
    description: '번식 통계 조회. 수태율, 발정탐지율, 평균공태일, 분만간격, 임신율 등 KPI를 반환한다. 농장별 또는 전체.',
    input_schema: {
      type: 'object' as const,
      properties: {
        farmId: { type: 'string', description: '농장 ID (생략 시 전체 농장)' },
      },
    },
  },
  {
    name: 'query_sensor_data',
    description: '개체의 센서 데이터 조회. 체온(temperature)과 활동량(activity)의 일별 집계 데이터를 반환한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        animalId: { type: 'string', description: '동물 ID (필수)' },
        metric: {
          type: 'string',
          enum: ['temperature', 'activity'],
          description: '메트릭 유형 (기본: temperature)',
        },
        days: { type: 'number', description: '조회할 일수 (기본 7, 최대 30)' },
      },
      required: ['animalId'],
    },
  },
];
