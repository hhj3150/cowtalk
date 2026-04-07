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
    description: '개체의 센서 데이터 조회. 일별 집계 + 기간 비교 분석(어제 대비, 3일 vs 7일, 변화율, 이상치 점수) + 개체별 기준선 + 품종/산차/DIM 보정 임계값을 반환한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        animalId: { type: 'string', description: '동물 ID (필수)' },
        metric: {
          type: 'string',
          enum: ['temperature', 'activity', 'rumination', 'water_intake', 'ph'],
          description: '메트릭 유형 (기본: temperature)',
        },
        days: { type: 'number', description: '조회할 일수 (기본 7, 최대 30)' },
        includeHourlyPattern: { type: 'boolean', description: '시간대별 패턴 분석 포함 여부 (기본: false)' },
      },
      required: ['animalId'],
    },
  },

  // ===========================
  // 번식 피드백 도메인
  // ===========================

  {
    name: 'query_conception_stats',
    description: '수태율 통계 조회. 정액별·개체별 수태율, 전체 수태율을 반환한다. 정액 성공률, 반복번식우, 번식성적 개선 추이를 확인할 수 있다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        farmId: { type: 'string', description: '농장 ID (생략 시 전체 농장)' },
      },
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
  {
    name: 'query_grade',
    description: '등급판정 결과 조회. 이력번호(12자리)로 소도체 등급(1++~3), 육질등급, 육량등급, 도체중, 판정일, 도축장명을 EKAPE에서 실시간 조회한다. 출하 소의 등급 확인, 품질 분석에 사용.',
    input_schema: {
      type: 'object' as const,
      properties: {
        traceId: { type: 'string', description: '이력제 12자리 번호 (예: "002132665191"). 필수.' },
      },
      required: ['traceId'],
    },
  },
  {
    name: 'query_auction_prices',
    description: '소도체 경락가격 조회. 품종별·등급별 평균/최고/최저 경락가(원/kg)를 조회한다. 시세 파악, 출하 시기 판단에 활용.',
    input_schema: {
      type: 'object' as const,
      properties: {
        startDate: { type: 'string', description: '조회 시작일 (YYYYMMDD, 예: "20260301"). 생략 시 최근 7일.' },
        endDate: { type: 'string', description: '조회 종료일 (YYYYMMDD). 생략 시 오늘.' },
        breed: {
          type: 'string',
          enum: ['한우', '육우', '젖소'],
          description: '품종 필터. 생략 시 전체.',
        },
      },
    },
  },
  {
    name: 'query_sire_info',
    description: '한우 씨수소(종모우) 정보 조회. 공공데이터(농촌진흥청)에서 등록된 씨수소의 번호, 이름, 혈통(부/모), 근교계수를 조회한다. 한우 교배 계획, 정액 선택에 활용. ⚠️ 한우 전용 — 젖소 종모우는 별도 조회 필요.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'query_weather',
    description: '농장 주변 기상 정보 + THI(온습도지수) 조회. 기온, 습도, THI 등급(정상/주의/위험/긴급)을 반환한다. 열스트레스 위험 판단, 사료 조정, 환기 가동 판단에 활용.',
    input_schema: {
      type: 'object' as const,
      properties: {
        farmId: { type: 'string', description: '농장 ID. 생략 시 전체 농장 평균.' },
      },
    },
  },

  // ===========================
  // 방역 도메인
  // ===========================

  {
    name: 'query_quarantine_dashboard',
    description: '방역 대시보드 종합 데이터 조회. 전국 감시 두수, 발열률, 집단발열 농장 수, 위험등급(green/yellow/orange/red), TOP5 위험농장, 24시간 발열 추이를 반환한다.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'query_national_situation',
    description: '전국 방역 현황 조회. 시도별 농장 수, 두수, 발열률, 위험등급을 반환한다. 광역 방역 대응 판단에 활용.',
    input_schema: {
      type: 'object' as const,
      properties: {
        province: { type: 'string', description: '시도명 (예: "경기도"). 생략 시 전국 시도별 목록.' },
      },
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
    description: '치료 기록. 개체에 대한 진단, 투약(약물·경로·빈도·기간), 임상소견(체온·CMT·BCS), 휴약기간을 기록한다. 휴약 종료일은 자동계산된다.',
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
        dosage: { type: 'string', description: '용량 (예: "2.2mg/kg", "20ml")' },
        route: { type: 'string', enum: ['IM', 'IV', 'SC', 'PO', 'topical', 'intramammary'], description: '투여 경로' },
        frequency: { type: 'string', description: '투여 빈도 (예: BID, SID, q12h)' },
        durationDays: { type: 'number', description: '투약 기간 (일)' },
        withdrawalDays: { type: 'number', description: '휴약기간 (일)' },
        rectalTemp: { type: 'number', description: '직장체온 (°C)' },
        cmtResult: { type: 'string', description: 'CMT 결과 (-, +, ++, +++)' },
        bcs: { type: 'number', description: '체형점수 BCS (1-5)' },
        hydrationLevel: { type: 'string', enum: ['normal', 'mild', 'moderate', 'severe'], description: '탈수 정도' },
        affectedQuarter: { type: 'string', description: '이환 유방 분방 (LF, RF, LR, RR)' },
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

  // ===========================
  // 임상 도메인 (수의사 핵심)
  // ===========================

  {
    name: 'query_differential_diagnosis',
    description: '감별진단 조회. 개체의 센서 데이터·건강 이력·농장 패턴을 분석하여 질병별 확률, 근거 센서 데이터, 확인검사 권장을 구조화 JSON으로 반환한다. 수의사가 건강 이상 개체를 질문할 때 반드시 호출.',
    input_schema: {
      type: 'object' as const,
      properties: {
        animalId: { type: 'string', description: '동물 ID (필수)' },
        symptoms: {
          type: 'array',
          items: { type: 'string' },
          description: '추가 임상 증상 (예: ["유방부종", "유질변화", "기침"])',
        },
      },
      required: ['animalId'],
    },
  },
  {
    name: 'confirm_treatment_outcome',
    description: '치료 결과 확인. 수의사가 치료 후 경과(완치/재발/악화)를 확정 기록한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        treatmentId: { type: 'string', description: '치료 기록 ID (필수)' },
        outcome: {
          type: 'string',
          enum: ['recovered', 'relapsed', 'worsened'],
          description: '치료 결과',
        },
        notes: { type: 'string', description: '비고' },
      },
      required: ['treatmentId', 'outcome'],
    },
  },
];
