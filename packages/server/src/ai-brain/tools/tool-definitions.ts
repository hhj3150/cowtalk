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

  // ===========================
  // 공공데이터 도메인
  // ===========================

  {
    name: 'query_traceability',
    description: '이력제 정보 조회. 이력번호(12자리)로 소의 출생정보, 이동이력, 백신접종, 방역검사 결과를 공공데이터(EKAPE)에서 실시간 조회한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        traceId: { type: 'string', description: '이력제 12자리 번호 (예: "002132665191"). 필수.' },
      },
      required: ['traceId'],
    },
  },

  // ===========================
  // 번식 도메인 (write)
  // ===========================

  {
    name: 'record_insemination',
    description: '수정 기록. 발정 감지 후 수정사가 인공수정을 수행한 결과를 기록한다. 정액 정보, 수정사명, 비고를 포함한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        animalId: { type: 'string', description: '동물 ID (필수)' },
        farmId: { type: 'string', description: '농장 ID (필수)' },
        semenInfo: { type: 'string', description: '정액 정보 (종모우번호 또는 설명)' },
        semenId: { type: 'string', description: '정액 카탈로그 ID (UUID)' },
        technicianName: { type: 'string', description: '수정사 이름' },
        notes: { type: 'string', description: '비고' },
      },
      required: ['animalId', 'farmId'],
    },
  },
  {
    name: 'record_pregnancy_check',
    description: '임신감정 결과 기록. 수정 후 일정 기간이 지나면 초음파/직장검사/혈액검사로 임신 여부를 확인한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        animalId: { type: 'string', description: '동물 ID (필수)' },
        result: {
          type: 'string',
          enum: ['pregnant', 'open'],
          description: '임신 여부 (필수)',
        },
        method: {
          type: 'string',
          enum: ['ultrasound', 'manual', 'blood'],
          description: '검사 방법 (기본: ultrasound)',
        },
        daysPostInsemination: { type: 'number', description: '수정 후 경과일' },
        notes: { type: 'string', description: '비고' },
      },
      required: ['animalId', 'result'],
    },
  },
  {
    name: 'recommend_insemination_window',
    description: '수정 적기 추천. 발정이 감지된 개체의 최적 수정 시간, 추천 정액, 주의사항을 반환한다. 목장별 번식 설정을 반영한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        animalId: { type: 'string', description: '동물 ID (필수)' },
        heatDetectedAt: { type: 'string', description: '발정 감지 시각 (ISO 8601). 생략 시 현재 시각.' },
      },
      required: ['animalId'],
    },
  },

  // ===========================
  // 농장 도메인
  // ===========================

  {
    name: 'record_treatment',
    description: '치료 기록. 개체에 대한 진단, 투약, 휴약기간을 기록한다. 수의사 또는 농장주가 사용.',
    input_schema: {
      type: 'object' as const,
      properties: {
        animalId: { type: 'string', description: '동물 ID (필수)' },
        diagnosis: { type: 'string', description: '진단명 (예: 유방염, 케토시스, 파행)' },
        severity: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: '심각도 (기본: medium)',
        },
        drug: { type: 'string', description: '투여 약물명' },
        dosage: { type: 'string', description: '용량 (예: "20ml")' },
        withdrawalDays: { type: 'number', description: '휴약기간 (일)' },
        notes: { type: 'string', description: '비고' },
      },
      required: ['animalId', 'diagnosis'],
    },
  },
  {
    name: 'get_farm_kpis',
    description: '농장 핵심 KPI 조회. 두수, 번식성적(수태율, 발정탐지율, 공태일), 최근 알림, 건강 이벤트 요약을 반환한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        farmId: { type: 'string', description: '농장 ID (필수)' },
      },
      required: ['farmId'],
    },
  },
];
