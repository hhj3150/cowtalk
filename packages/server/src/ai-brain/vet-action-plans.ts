// 수의학 전문가 액션플랜 지식베이스
// smaXtec 이벤트 유형 + 심각도 → 즉각적 현장 행동 지침
// 기반: 수의학, 번식학, 영양학, 행동학, 역학, 전염병학, 대사성질병, 환경공학

export interface VetActionPlan {
  readonly eventType: string;
  readonly title: string;
  readonly urgency: 'immediate' | 'within_2h' | 'within_6h' | 'within_24h' | 'scheduled';
  readonly actions: readonly VetActionStep[];
  readonly differentialDiagnosis: readonly string[];
  readonly epidemiologicalNote: string | null;
  readonly preventiveMeasures: readonly string[];
}

export interface VetActionStep {
  readonly step: number;
  readonly instruction: string;
  readonly detail: string;
  readonly timeframe: string;
  readonly responsible: 'farmer' | 'veterinarian' | 'inseminator' | 'quarantine_officer';
}

// ── 이벤트 유형별 액션플랜 맵 ──

const ACTION_PLANS: Readonly<Record<string, Readonly<Record<string, VetActionPlan>>>> = {

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 발정 (Estrus)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  estrus: {
    default: {
      eventType: 'estrus',
      title: '🔴 발정 감지 — 적기 수정 필요',
      urgency: 'within_6h',
      actions: [
        {
          step: 1,
          instruction: '발정 징후 육안 확인',
          detail: '승가 허용, 외음부 충혈·부종·점액 분비, 안절부절·울음·식욕 감소 확인. 활동량 데이터 교차 확인.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 2,
          instruction: '수정 적기 판단 및 수정사 호출',
          detail: 'AM/PM 규칙: 오전 발정 → 당일 오후 수정, 오후 발정 → 다음날 오전 수정. 센서 발정 감지 후 12~18시간이 최적 수정 시점.',
          timeframe: '발정 감지 후 12~18시간',
          responsible: 'inseminator',
        },
        {
          step: 3,
          instruction: '직장검사로 난포 상태 확인',
          detail: '난포 직경 15mm 이상, 자궁 긴장도 양호 시 수정 진행. 난포낭종(>25mm) 의심 시 GnRH 투여 고려.',
          timeframe: '수정 직전',
          responsible: 'veterinarian',
        },
        {
          step: 4,
          instruction: '수정 기록 및 반복발정 모니터링 설정',
          detail: '수정 후 18~24일(21일 주기) 발정 회귀 모니터링. 30일 후 초음파 임신 진단 예약.',
          timeframe: '수정 직후',
          responsible: 'farmer',
        },
      ],
      differentialDiagnosis: [
        '진성 발정 vs. 가발정 (임신 중 발정 유사 행동)',
        '난포낭종 (반복 발정, 강한 발정 징후)',
        '자궁 감염 (발정 시 화농성 분비물)',
      ],
      epidemiologicalNote: null,
      preventiveMeasures: [
        '산후 45일부터 발정 모니터링 시작',
        'BCS 3.0~3.5 유지로 발정 발현율 향상',
        '비타민 A·E·셀레늄 보충으로 번식 기능 개선',
      ],
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 분만 감지 (Calving)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  calving_detection: {
    default: {
      eventType: 'calving_detection',
      title: '🐮 분만 감지 — 24시간 이내 분만 준비',
      urgency: 'immediate',
      actions: [
        {
          step: 1,
          instruction: '분만 징후 즉시 확인',
          detail: '체온 0.3~0.5°C 하강, 골반 인대 이완, 외음부 부종·점액 분비, 유방 팽만, 꼬리 들어올림. 식욕 저하·불안 행동 관찰.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 2,
          instruction: '분만방 이동 및 환경 준비',
          detail: '깨끗하고 건조한 분만방(최소 4×4m), 깔짚 충분, 조명 확보. 소독된 분만 보조 도구 준비 (체인, 견인기, 소독제, 타월).',
          timeframe: '감지 후 1시간 이내',
          responsible: 'farmer',
        },
        {
          step: 3,
          instruction: '분만 경과 모니터링',
          detail: '1기(개구기): 2~6시간 — 불안, 눕기·일어서기 반복. 2기(만출기): 30분~2시간 — 양막 파열 후 태아 진행. 2기 2시간 초과 또는 양막 파열 후 1시간 내 진행 없으면 수의사 호출.',
          timeframe: '분만 전 과정',
          responsible: 'farmer',
        },
        {
          step: 4,
          instruction: '난산 대비 수의사 대기',
          detail: '초산우, 쌍태 의심, 태위 이상 시 즉시 호출. 분만 보조 시 위생 필수 (장갑, 윤활제). 제왕절개 가능성 대비.',
          timeframe: '난산 징후 발견 즉시',
          responsible: 'veterinarian',
        },
        {
          step: 5,
          instruction: '산후 관리 프로토콜',
          detail: '초유 품질 확인(Brix ≥22%), 송아지 출생 후 2시간 이내 초유 4L 급여. 태반 배출 12시간 이내 확인. 산후 자궁 관리 및 칼슘 보충.',
          timeframe: '분만 직후',
          responsible: 'farmer',
        },
      ],
      differentialDiagnosis: [
        '정상 분만 vs. 난산 (태아 크기, 태위, 자궁 무력증)',
        '유산 (임신 중기 분만 징후)',
        '태반 정체 (분만 후 12시간 태반 미배출)',
      ],
      epidemiologicalNote: '분만 후 면역 저하 기간(transition period)에 전염성 질병 감수성 증가. 분만방 격리와 소독 철저.',
      preventiveMeasures: [
        '건유기(dry period) 영양 관리 — DCAD 사료 프로그램',
        '분만 예정일 1주 전부터 일별 체온 모니터링',
        '분만 전 비타민 E·셀레늄 주사로 태반 정체 예방',
        '초산우 교배 시 체격 적합 종모우 선택',
      ],
    },
  },

  calving_imminent: {
    default: {
      eventType: 'calving_imminent',
      title: '🚨 분만 임박 — 즉시 준비',
      urgency: 'immediate',
      actions: [
        {
          step: 1,
          instruction: '분만방 즉시 이동',
          detail: '깔짚 교체, 급수기 확인, 조명·CCTV 작동 확인. 다른 소와 격리.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 2,
          instruction: '분만 보조 도구 점검',
          detail: '분만 체인, 견인기, 소독 장갑, 윤활제, 타월, 초유 해동/준비, 이어태그, 체중계.',
          timeframe: '30분 이내',
          responsible: 'farmer',
        },
        {
          step: 3,
          instruction: '수의사 사전 연락',
          detail: '초산우·쌍태·과거 난산 이력 시 사전 대기 요청. 응급 연락처 확인.',
          timeframe: '1시간 이내',
          responsible: 'veterinarian',
        },
      ],
      differentialDiagnosis: [
        '정상 분만 임박 vs. 조산(premature calving)',
        '저칼슘혈증(milk fever) 동반 가능성',
      ],
      epidemiologicalNote: null,
      preventiveMeasures: [
        '분만 전 3주 DCAD 음이온 사료로 저칼슘혈증 예방',
        '분만 스코어링 시트 활용으로 체계적 관리',
      ],
    },
  },

  calving_confirmation: {
    default: {
      eventType: 'calving_confirmation',
      title: '✅ 분만 확인 — 산후 관리 시작',
      urgency: 'within_2h',
      actions: [
        {
          step: 1,
          instruction: '송아지 초유 급여',
          detail: '출생 후 2시간 이내 초유 4L 급여 (Brix ≥22%). 초유 품질 불량 시 냉동 초유 사용. 12시간 후 추가 2L.',
          timeframe: '출생 후 2시간 이내',
          responsible: 'farmer',
        },
        {
          step: 2,
          instruction: '어미소 산후 관리',
          detail: '체온 측정 (>39.5°C → 자궁염 의심), 칼슘 드렌치 급여, 따뜻한 물 충분 급수. 식욕 회복 확인.',
          timeframe: '분만 후 즉시',
          responsible: 'farmer',
        },
        {
          step: 3,
          instruction: '태반 배출 확인',
          detail: '12시간 이내 태반 배출 확인. 미배출 시 수의사 연락 (무리한 제거 금지). 태반 정체 시 항생제 자궁 내 투여 고려.',
          timeframe: '분만 후 12시간',
          responsible: 'veterinarian',
        },
        {
          step: 4,
          instruction: '출생 기록 및 이표 부착',
          detail: '송아지 체중, 성별, 모체 ID, 분만 난이도(1~5점) 기록. 귀표 부착. NAIS 등록.',
          timeframe: '24시간 이내',
          responsible: 'farmer',
        },
      ],
      differentialDiagnosis: [
        '정상 산후 vs. 산후 저칼슘혈증(milk fever)',
        '태반 정체 (retained placenta)',
        '산후 자궁염 (metritis)',
      ],
      epidemiologicalNote: '산후 면역 억제기(NEB, 에너지 부족) — 세균 감염 취약. 축사 위생 강화 필수.',
      preventiveMeasures: [
        '산후 칼슘 볼루스/드렌치 예방적 급여',
        '신생 송아지 배꼽 소독 (7% 요오드)',
        'BVD/IBR 등 전염병 예방 접종 이력 확인',
      ],
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 체온 이상 (Temperature)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  temperature_high: {
    critical: {
      eventType: 'temperature_high',
      title: '🌡️🔴 체온 급상승 — 긴급 감염성 질병 의심',
      urgency: 'immediate',
      actions: [
        {
          step: 1,
          instruction: '즉시 격리 및 직장 체온 확인',
          detail: '직장 체온계로 정확한 체온 측정. 39.5°C 이상이면 발열. 40.5°C 이상이면 중증. 체온 상승 개체 즉시 격리.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 2,
          instruction: '임상 증상 상세 관찰',
          detail: '호흡수(정상: 15~30회/분), 심박수(정상: 60~80회/분), 식욕, 유량 변화, 설사/비강 분비물/기침/절뚝거림/눈물/침흘림 여부. 반추시간 감소 교차 확인.',
          timeframe: '격리 후 즉시',
          responsible: 'farmer',
        },
        {
          step: 3,
          instruction: '수의사 긴급 호출 — 전염병 감별진단',
          detail: '혈액검사(CBC, 생화학), 바이러스 PCR 검사 의뢰. 구제역/BVD/IBR/PI3/BRSV/부루셀라/탄저/기종저 감별. 동일 축사 내 다른 소 체온 일제 측정.',
          timeframe: '1시간 이내',
          responsible: 'veterinarian',
        },
        {
          step: 4,
          instruction: '역학 조사 및 방역 조치',
          detail: '최근 2주 이내 외부 소 도입 이력, 방문자 기록, 인접 농장 질병 발생 현황 확인. 동일 축사 군집 발열 시 방역당국 신고 고려.',
          timeframe: '2시간 이내',
          responsible: 'quarantine_officer',
        },
        {
          step: 5,
          instruction: '대증 요법 시작',
          detail: '비스테로이드 소염제(플루닉신 메글루민 2.2mg/kg IV) + 수액 요법. 세균 감염 의심 시 광범위 항생제 투여. 휴약기간 기록.',
          timeframe: '수의사 도착 후',
          responsible: 'veterinarian',
        },
      ],
      differentialDiagnosis: [
        '급성 유방염 (Acute mastitis) — 유방 발적·열감·부종',
        '자궁염/패혈증 (Metritis/Septicemia) — 산후 10일 이내 호발',
        'BRD 소 호흡기 복합체 (Bovine Respiratory Disease)',
        '구제역 (FMD) — 수포성 병변, 침흘림, 절뚝거림 (법정전염병)',
        'BVD (소 바이러스성 설사) — 설사, 구강 미란, 면역 억제',
        '탄저 (Anthrax) — 급사, 출혈성 분비물 (1종 가축전염병)',
        '기종저 (Blackleg) — 근육 부종, 만지면 파닥소리',
        '열사병 (Heat stress) — 고온기, THI>72, 호흡수 증가',
      ],
      epidemiologicalNote: '군집 발열(같은 축사 3두 이상 동시 발열) → 전염성 질병 강력 의심. 즉시 이동 제한 + 방역당국 보고. 지역 내 질병 발생 현황 교차 확인 필수.',
      preventiveMeasures: [
        '정기 예방 접종 프로그램 준수 (BVD, IBR, PI3, BRSV, 기종저, 탄저)',
        '외부 소 도입 시 21일 격리 검역',
        '축사 출입 시 소독 발판·소독조 운영',
        '사료·음수 오염원 점검',
        '고온기 환풍·쿨링 시스템 가동',
      ],
    },
    default: {
      eventType: 'temperature_high',
      title: '🌡️ 체온 상승 감지 — 원인 확인 필요',
      urgency: 'within_2h',
      actions: [
        {
          step: 1,
          instruction: '직장 체온 측정으로 재확인',
          detail: '위내센서 체온은 상대 편차값. 직장 체온계로 정확한 값 확인. 정상 범위: 38.0~39.3°C.',
          timeframe: '1시간 이내',
          responsible: 'farmer',
        },
        {
          step: 2,
          instruction: '식욕·반추·유량 변화 기록',
          detail: '식욕 감소, 반추시간 감소, 유량 변화 등 동반 증상 확인. 센서 데이터와 교차 분석.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 3,
          instruction: '동반 증상에 따른 감별',
          detail: '유방 이상 → 유방염 검사(CMT), 호흡 이상 → BRD 의심, 설사 → 소화기 감염, 절뚝거림 → 발굽 질환. 산후 10일 이내 → 자궁염 우선 의심.',
          timeframe: '2시간 이내',
          responsible: 'veterinarian',
        },
        {
          step: 4,
          instruction: '같은 축사 다른 개체 모니터링',
          detail: '동일 그룹 내 추가 발열 개체 확인. 2두 이상 동시 발열 시 전염성 질병 프로토콜 발동.',
          timeframe: '6시간 이내',
          responsible: 'farmer',
        },
      ],
      differentialDiagnosis: [
        '유방염 (Mastitis) — 가장 흔한 원인',
        '자궁염 (Metritis) — 산후 발열의 주원인',
        '소 호흡기 질환 (BRD)',
        '대사성 질환 (케토시스, 변위 위장)',
        '열 스트레스 (여름철)',
        '예방 접종 후 일시적 발열',
      ],
      epidemiologicalNote: '단일 개체 발열은 대사성/국소 감염 가능성 높음. 군집 발열 시 전염성 질병 역학 조사 필요.',
      preventiveMeasures: [
        '일별 체온 자동 모니터링 (smaXtec 센서 활용)',
        '환경 스트레스 관리 (THI 모니터링)',
        '면역 프로그램 정기 점검',
      ],
    },
  },

  temperature_low: {
    default: {
      eventType: 'temperature_low',
      title: '🌡️⬇️ 체온 하강 감지 — 원인 확인 필요',
      urgency: 'within_2h',
      actions: [
        {
          step: 1,
          instruction: '직장 체온 측정으로 재확인',
          detail: '직장 체온 37.5°C 이하 → 저체온증. 분만 임박 시 정상적 체온 하강(0.3~0.5°C) 가능.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 2,
          instruction: '분만 임박 여부 확인',
          detail: '임신 말기 소의 체온 하강 → 24~48시간 내 분만 가능성. 골반 인대 이완, 외음부 변화 확인.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 3,
          instruction: '저칼슘혈증/저마그네슘혈증 감별',
          detail: '기립 불능, 근육 떨림, S자 목, 동공 산대 → 저칼슘혈증(Milk fever) 의심. 칼슘 보로글루콘산 정맥 주사 준비.',
          timeframe: '1시간 이내',
          responsible: 'veterinarian',
        },
        {
          step: 4,
          instruction: '환경 요인 점검',
          detail: '한랭 스트레스, 환기 과다, 젖은 깔짚 → 저체온 유발. 특히 신생 송아지와 노령 개체 취약.',
          timeframe: '확인 후 조치',
          responsible: 'farmer',
        },
      ],
      differentialDiagnosis: [
        '분만 임박 (정상 체온 하강)',
        '저칼슘혈증 (Milk fever/Hypocalcemia)',
        '저마그네슘혈증 (Grass tetany)',
        '패혈증 말기 (체온 하강은 예후 불량 징후)',
        '한랭 스트레스',
        '심부전/순환 장애',
      ],
      epidemiologicalNote: '저칼슘혈증은 고비유 경산우에서 호발. 분만 전후 DCAD 사료로 예방. 목초지 방목 시 저마그네슘혈증 주의.',
      preventiveMeasures: [
        '건유기 DCAD 프로그램으로 저칼슘혈증 예방',
        '분만 전 1주 체온 일별 모니터링',
        '한랭기 방풍·보온 설비 점검',
        '목초지 마그네슘 보충',
      ],
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 반추 이상 (Rumination)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  rumination_decrease: {
    critical: {
      eventType: 'rumination_decrease',
      title: '🔄🔴 반추 급감 — 급성 질환 의심',
      urgency: 'immediate',
      actions: [
        {
          step: 1,
          instruction: '즉시 임상 관찰',
          detail: '반추 완전 정지(>12시간) → 급성 위장관 질환 강력 의심. 복부 팽만, 복통 징후(발로 배를 참, 눕기·일어서기 반복), 분변 상태 확인.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 2,
          instruction: '수의사 긴급 호출',
          detail: '좌측 복부 팽만 → 제4위 변위(LDA/RDA) 의심. 우측 팽만 → 맹장 확장/염전. 탈수 확인 (피부 텐트 테스트, CRT). 수액·전해질 준비.',
          timeframe: '즉시',
          responsible: 'veterinarian',
        },
        {
          step: 3,
          instruction: '체온 + 심박수 + 호흡수 측정',
          detail: '체온 >39.5°C + 반추 감소 → 감염성 원인. 심박수 >90bpm → 중증 통증/탈수. 호흡수 >40회/분 → 산독증/대사 이상.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 4,
          instruction: '사료·음수 이력 확인',
          detail: '사료 급변, 곡류 과식, 곰팡이 오염 사료 급여 이력 확인. TMR 혼합 불균일, 선별 급이(sorting) 문제 점검.',
          timeframe: '1시간 이내',
          responsible: 'farmer',
        },
      ],
      differentialDiagnosis: [
        '제4위 변위 (LDA/RDA) — 산후 1~4주 호발, 좌측 핑퐁음',
        '급성 산독증 (Ruminal acidosis) — 곡류 과식 후 발생',
        '외상성 위염 (Hardware disease) — 금속 이물질 섭취',
        '케토시스 (Ketosis) — 산후 NEB, 아세톤 냄새',
        '급성 유방염 동반',
        '장폐색/맹장 염전',
      ],
      epidemiologicalNote: '반추 감소는 질병의 가장 민감한 초기 지표. 체온 변화보다 12~24시간 먼저 나타남. 군집 반추 감소 → 사료 문제(산독증, 곰팡이독소) 의심.',
      preventiveMeasures: [
        'TMR 혼합 균일성 정기 점검',
        '사료 급변 금지 (최소 7~14일 점진적 전환)',
        '분만 전후 에너지 균형 관리 (NEB 예방)',
        '사료 저장 관리 (곰팡이독소 방지)',
        '금속 이물질 방지 (자석 볼루스 투여)',
      ],
    },
    default: {
      eventType: 'rumination_decrease',
      title: '🔄 반추시간 감소 — 모니터링 강화',
      urgency: 'within_6h',
      actions: [
        {
          step: 1,
          instruction: '식욕·분변 상태 확인',
          detail: '사료 섭취량 변화, 분변 점수(1~5점) 확인. 분변 묽음(점수 1~2) → 소화기 문제, 건조(4~5) → 탈수/변비.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 2,
          instruction: '체온 측정 및 교차 분석',
          detail: '반추 감소 + 체온 상승 → 감염성 질환. 반추 감소 + 정상 체온 → 대사성/영양 문제 가능성.',
          timeframe: '2시간 이내',
          responsible: 'farmer',
        },
        {
          step: 3,
          instruction: '24시간 추적 관찰',
          detail: '반추시간 트렌드 확인. 24시간 지속 감소 → 수의사 호출. 일시적 감소(스트레스, 더위) 후 회복 여부 관찰.',
          timeframe: '24시간',
          responsible: 'farmer',
        },
      ],
      differentialDiagnosis: [
        '경도 산독증 (SARA) — TMR 선별, NFC 과다',
        '열 스트레스 — THI>72, 호흡수 증가 동반',
        '사회적 스트레스 — 그룹 이동, 우두머리 변경',
        '초기 케토시스',
        '경도 유방염',
      ],
      epidemiologicalNote: null,
      preventiveMeasures: [
        '유효 섬유소(peNDF) 최소 21% 확보',
        'TMR 입도 분석 정기 시행 (Penn State Shaker)',
        '급이 공간 60cm/두 이상 확보',
        '고온기 쿨링 시스템 가동',
      ],
    },
  },

  rumination_warning: {
    default: {
      eventType: 'rumination_warning',
      title: '🔄⚠️ 반추 이상 경고',
      urgency: 'within_6h',
      actions: [
        {
          step: 1,
          instruction: '반추 패턴 분석',
          detail: '정상 반추: 하루 6~8시간(360~480분). 300분 이하 → 주의, 200분 이하 → 위험. 개체별 기저 수준 대비 30% 이상 감소 시 이상.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 2,
          instruction: '사료·환경 요인 점검',
          detail: 'TMR 배합 변경, 사일리지 품질, 급이 시간 변경, 그룹 이동, 폭우·폭염 등 스트레스 요인 확인.',
          timeframe: '2시간 이내',
          responsible: 'farmer',
        },
        {
          step: 3,
          instruction: '동일 그룹 반추 패턴 비교',
          detail: '군집 반추 감소 → 사료 문제(곰팡이독소, 산독증). 개별 감소 → 개체 질환. smaXtec 군집 모니터링 활용.',
          timeframe: '6시간 이내',
          responsible: 'farmer',
        },
      ],
      differentialDiagnosis: [
        '사료 변경에 따른 일시적 적응',
        '열 스트레스 (여름철)',
        'SARA (아급성 산독증)',
        '초기 질환의 조기 징후',
      ],
      epidemiologicalNote: null,
      preventiveMeasures: [
        '일별 반추 모니터링으로 개체·군집 이상 조기 감지',
        '사료 변경 시 최소 7일 전환기 적용',
        '곰팡이독소 바인더 첨가 고려',
      ],
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 건강 경고 (Health)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  health_general: {
    default: {
      eventType: 'health_general',
      title: '🏥 건강 종합 알림',
      urgency: 'within_6h',
      actions: [
        {
          step: 1,
          instruction: '종합 임상 검사',
          detail: '체온, 심박수, 호흡수, BCS, 유량, 사료 섭취량 확인. 보행 상태(locomotion score 0~5) 관찰.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 2,
          instruction: '센서 데이터 종합 분석',
          detail: '체온 트렌드, 반추 트렌드, 활동량, pH 패턴을 함께 분석. 다중 지표 동시 이상 → 중증도 높음.',
          timeframe: '2시간 이내',
          responsible: 'veterinarian',
        },
        {
          step: 3,
          instruction: '이력 기반 위험 평가',
          detail: '과거 질병 이력, 산차, 비유 단계, 최근 처치 이력 확인. 반복성 질환(유방염, 발굽 질환) 패턴 파악.',
          timeframe: '6시간 이내',
          responsible: 'veterinarian',
        },
      ],
      differentialDiagnosis: [
        '다양한 원인 가능 — 센서 데이터 교차 분석 필요',
      ],
      epidemiologicalNote: null,
      preventiveMeasures: [
        '정기 건강 검진 (분만 후 7일, 14일, 30일)',
        '예방 접종 및 구충 프로그램 준수',
        '환경 위생 관리',
      ],
    },
  },

  health_warning: {
    default: {
      eventType: 'health_warning',
      title: '🏥⚠️ 건강 경고',
      urgency: 'within_6h',
      actions: [
        {
          step: 1,
          instruction: '개체 격리 관찰',
          detail: '행동 이상, 식욕 부진, 분변 이상 등 확인. 체온·반추 센서 데이터 교차 분석.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 2,
          instruction: '수의사 진찰 예약',
          detail: '지속적 건강 경고 시 정밀 진찰 필요. 혈액검사, 소변검사, 직장검사 등 시행.',
          timeframe: '24시간 이내',
          responsible: 'veterinarian',
        },
      ],
      differentialDiagnosis: [
        '초기 대사성 질환 (케토시스, 저칼슘혈증)',
        '만성 유방염',
        '발굽 질환 (지간피부염, 제엽염)',
        '기생충 감염',
      ],
      epidemiologicalNote: null,
      preventiveMeasures: [
        '분만 전후 transition 관리 프로그램',
        '발굽 관리 프로그램 (정기 삭제, 족욕)',
        '체형 점수(BCS) 모니터링',
      ],
    },
  },

  clinical_condition: {
    default: {
      eventType: 'clinical_condition',
      title: '🏥🔴 임상 증상 감지',
      urgency: 'within_2h',
      actions: [
        {
          step: 1,
          instruction: '증상 확인 및 기록',
          detail: 'smaXtec 센서가 감지한 임상 이상 신호를 육안으로 확인. 호흡, 보행, 자세, 분비물, 복부 상태 관찰.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 2,
          instruction: '수의사 호출',
          detail: '임상 증상 확인 → 즉시 수의사 진찰. 상세 이력(발생 시점, 진행 속도, 동반 증상)을 수의사에게 전달.',
          timeframe: '2시간 이내',
          responsible: 'veterinarian',
        },
        {
          step: 3,
          instruction: '전염 위험 평가',
          detail: '동일 축사 내 유사 증상 개체 확인. 2두 이상 → 전염성 질환 프로토콜. 이동 제한 고려.',
          timeframe: '진찰과 동시',
          responsible: 'quarantine_officer',
        },
      ],
      differentialDiagnosis: [
        '감염성 질환 (세균, 바이러스, 기생충)',
        '대사성 질환',
        '중독 (사료, 식물, 화학물질)',
        '외상',
      ],
      epidemiologicalNote: '임상 증상 개체의 급증은 전염병 발생의 핵심 신호. 지역 내 질병 발생 현황과 교차 분석 필수.',
      preventiveMeasures: [
        '일상적 관찰을 통한 조기 발견',
        '정기 수의사 방문 프로그램',
        '축사 위생·소독 프로토콜',
      ],
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 활동·음수·pH
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  activity_decrease: {
    default: {
      eventType: 'activity_decrease',
      title: '📉 활동량 감소',
      urgency: 'within_6h',
      actions: [
        {
          step: 1,
          instruction: '보행 관찰 (Locomotion scoring)',
          detail: '보행 점수 0~5 평가. 3점 이상(절뚝거림) → 발굽 검사 필요. 누워 있는 시간 증가 → 관절/발굽 통증 의심.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 2,
          instruction: '체온·반추 데이터 교차 확인',
          detail: '활동 감소 + 체온 상승 → 감염성 질환. 활동 감소 + 반추 감소 → 중증도 높음. 활동 감소 단독 → 발굽/관절 질환 가능성.',
          timeframe: '2시간 이내',
          responsible: 'farmer',
        },
        {
          step: 3,
          instruction: '발굽 검사 및 삭제',
          detail: '발굽 질환은 유방염 다음으로 흔한 질병. 지간피부염(DD), 제엽염, 화이트라인 질환 확인. 정기 삭제 이력 점검.',
          timeframe: '24시간 이내',
          responsible: 'veterinarian',
        },
      ],
      differentialDiagnosis: [
        '발굽 질환 (지간피부염, 제엽염)',
        '관절염',
        '열 스트레스',
        '전신 질환의 초기 징후',
        '분만 임박',
      ],
      epidemiologicalNote: null,
      preventiveMeasures: [
        '정기 발굽 삭제 (연 2~3회)',
        '족욕 프로그램 (5% 황산구리 또는 포르말린)',
        '우사 바닥 상태 관리 (고무 매트, 배수)',
        '충분한 우상 공간 확보',
      ],
    },
  },

  drinking_decrease: {
    default: {
      eventType: 'drinking_decrease',
      title: '💧 음수량 감소',
      urgency: 'within_6h',
      actions: [
        {
          step: 1,
          instruction: '급수 시설 점검',
          detail: '급수기 작동 상태, 수압, 수온, 수질 확인. 급수 위치 접근성 (경쟁, 우두머리 행동으로 접근 차단 가능).',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 2,
          instruction: '탈수 징후 확인',
          detail: '피부 텐트 테스트(>3초 → 탈수), 눈 함몰, 점막 건조, 유량 감소. 정상 음수량: 체중 1kg당 약 100ml.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 3,
          instruction: '소화기 문제 감별',
          detail: '음수 감소 + 식욕 부진 → 소화기 질환(제4위 변위, 장폐색). 음수 감소 + 발열 → 감염성 질환.',
          timeframe: '2시간 이내',
          responsible: 'veterinarian',
        },
      ],
      differentialDiagnosis: [
        '급수 시설 문제 (수압, 수질, 동결)',
        '소화기 질환 (제4위 변위, 장폐색)',
        '감염성 질환 동반',
        '한랭 스트레스 (겨울철 찬물 기피)',
        '사회적 스트레스 (급수기 접근 경쟁)',
      ],
      epidemiologicalNote: null,
      preventiveMeasures: [
        '급수기 정기 점검 및 청소 (주 1회)',
        '급수 공간 충분 확보 (15~20두당 급수기 1개)',
        '겨울철 수온 관리 (히팅)',
        '수질 검사 정기 시행',
      ],
    },
  },

  ph_warning: {
    default: {
      eventType: 'ph_warning',
      title: '⚗️ 반추위 pH 이상',
      urgency: 'within_2h',
      actions: [
        {
          step: 1,
          instruction: 'pH 패턴 분석',
          detail: '정상 반추위 pH: 5.8~7.0. pH<5.5(>3시간/일) → SARA(아급성 산독증). pH<5.0 → 급성 산독증 위험.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 2,
          instruction: '사료 배합 긴급 점검',
          detail: 'NFC 비율 확인 (적정: 35~42%), 유효 섬유소 peNDF 확인(적정: ≥21%). TMR 선별(sorting) 방지 — 수분 함량 45~55% 유지.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 3,
          instruction: '중탄산나트륨(Buffer) 보충',
          detail: 'SARA 의심 시 중탄산나트륨 150~200g/두/일 TMR 첨가. 급성 산독증 시 수의사 처치(경구 중탄산나트륨 드렌치).',
          timeframe: '확인 후 즉시',
          responsible: 'veterinarian',
        },
      ],
      differentialDiagnosis: [
        'SARA (아급성 반추위 산독증) — 가장 흔함',
        '급성 산독증 — 곡류 과식',
        '사료 배합 불균형',
        '급이 관리 문제 (선별 급이, 불규칙 급이)',
      ],
      epidemiologicalNote: 'SARA는 농장 수준 문제(herd-level)로 군집의 30~40%가 동시 이환 가능. 유지방률 역전(지방률 < 단백률)이 지표.',
      preventiveMeasures: [
        '정기 TMR 입도 분석 (Penn State Shaker)',
        '사료 변경 시 14일 점진적 전환',
        '급이 횟수 2회 이상 (push-up 포함)',
        '급이 공간 확보 (60cm/두)',
      ],
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 번식 관련
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  fertility_warning: {
    default: {
      eventType: 'fertility_warning',
      title: '💕⚠️ 번식 이상 경고',
      urgency: 'within_24h',
      actions: [
        {
          step: 1,
          instruction: '번식 이력 확인',
          detail: '마지막 수정일, 수정 횟수, 수태율, 산차, 분만 후 일수(DIM) 확인. VWP(자발적 대기 기간) 경과 여부.',
          timeframe: '즉시',
          responsible: 'farmer',
        },
        {
          step: 2,
          instruction: '수의사 번식 검사',
          detail: '직장검사: 자궁 크기·긴장도, 난소 촉진(난포/황체/낭종). 초음파: 자궁 내 삼출물, 난포 발달 상태. 자궁경 검사: 만성 자궁내막염.',
          timeframe: '24시간 이내',
          responsible: 'veterinarian',
        },
        {
          step: 3,
          instruction: '호르몬 프로토콜 적용 검토',
          detail: '반복 수정 실패(>3회) → OvSynch/PreSynch 동기화 프로토콜 적용. 난포낭종 → GnRH 투여. 황체 유지 → PGF2α.',
          timeframe: '수의사 판단 후',
          responsible: 'veterinarian',
        },
      ],
      differentialDiagnosis: [
        '만성 자궁내막염',
        '난포낭종/황체낭종',
        '조기 배란 사멸',
        '영양 불균형 (에너지 부족, 단백과다)',
        'BVD 지속 감염 (PI)',
      ],
      epidemiologicalNote: '번식 성적 저하가 농장 전체 → BVD/Neospora/Leptospira 등 전염성 원인 검사 필요.',
      preventiveMeasures: [
        '산후 자궁 건강 관리 (40~60일 자궁 회복)',
        'BCS 2.75~3.25 유지',
        '비타민 A·E·셀레늄·베타카로틴 보충',
        'BVD/Leptospira/Neospora 검사 및 예방',
      ],
    },
  },
};

// ── 공개 API ──

/**
 * 이벤트 유형과 심각도에 맞는 수의학 액션플랜을 반환한다.
 * critical 심각도 전용 플랜이 있으면 우선 적용, 없으면 default.
 */
export function getVetActionPlan(eventType: string, severity?: string): VetActionPlan | null {
  const plans = ACTION_PLANS[eventType];
  if (!plans) return null;

  // critical 심각도 전용 플랜이 있는 경우 우선
  if (severity === 'critical' && plans.critical) {
    return plans.critical;
  }

  return plans.default ?? null;
}

/**
 * 모든 등록된 이벤트 유형 목록
 */
export function getRegisteredEventTypes(): readonly string[] {
  return Object.keys(ACTION_PLANS);
}

/**
 * 이벤트 유형에 대한 역학적 주의사항을 반환 (지역/국가 단위 모니터링용)
 */
export function getEpidemiologicalNotes(eventTypes: readonly string[]): readonly {
  readonly eventType: string;
  readonly note: string;
}[] {
  const results: { eventType: string; note: string }[] = [];

  for (const et of eventTypes) {
    const plans = ACTION_PLANS[et];
    if (!plans) continue;

    // critical 플랜의 역학 노트 우선
    const plan = plans.critical ?? plans.default;
    if (plan?.epidemiologicalNote) {
      results.push({ eventType: et, note: plan.epidemiologicalNote });
    }
  }

  return results;
}
