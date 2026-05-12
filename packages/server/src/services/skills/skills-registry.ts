// Skills 프레임워크 — 재사용 워크플로
// 사용자가 특정 키워드(월간 감사, 전염병 대응, 번식 진단, 사양 평가 등)를 입력하면
// 해당 Skill의 SOP를 시스템 프롬프트에 추가하여 AI가 정형화된 workflow를 실행.
//
// 트리거는 키워드 기반. 첫 매칭 1개만 적용 (중복 트리거 방지).

export interface Skill {
  readonly id: string;
  readonly title: string;
  readonly triggers: readonly RegExp[];
  readonly systemAddendum: string;
}

const MONTHLY_AUDIT_SOP = `

## 활성 Skill — 월간 농장 감사

사용자가 월간 감사·평가·리뷰를 요청했습니다. 다음 워크플로를 따르세요:

1) **데이터 수집 (병렬 도구 호출)**:
   - query_farm_summary — 농장 KPI
   - query_breeding_stats — 번식 성적 (수태율·발정탐지·공태일·분만간격)
   - get_farm_kpis — 건강·센서·알람 종합

2) **5개 영역 평가** (각 한 줄 평):
   - 번식: 수태율·발정탐지·공태일 vs 목표 (50%·70%·130일)
   - 건강: 발열·반추저하 발생률 + 주요 질병 패턴
   - 사양: 사료·물·환경 (TMR·THI·체형 점수 가능 시)
   - 운영: 작업 처리율·기록 충실도
   - 경영: 도태율·산차 분포·교체 비율

3) **개선 액션 3개** (시간 단위 우선순위):
   - 이번 주 안에 한 가지
   - 이번 달 안에 한 가지
   - 다음 달 목표 한 가지

4) **시각화 권장**: SVG 차트 1개로 핵심 지표 추이 (선 차트 또는 막대 비교)

음성 비서 톤 유지 — 5개 영역을 항목 나열로 쏟지 말고 "어디부터 보실래요?" 식 드릴다운.
`;

const EPIDEMIC_SOP_SOP = `

## 활성 Skill — 전염병 대응 SOP (1종 가축전염병 의심 시)

**최우선 — 1종 가축전염병(구제역·럼피스킨·BSE·우역) 의심 시 시간 단위 액션**:

**0~30분 (즉시)**:
- 의심축 격리 (별도 우방, 작업자 동선 차단)
- 우방 폐쇄, 외부 출입 통제
- 사료·물·분뇨 동선 차단
- 사진·체온·증상 기록

**30분 ~ 2시간**:
- 시·군 가축방역관 또는 가축위생방역지원본부 연락
- KAHIS(국가가축위생정보시스템) 보고 준비
- 농장 내 모든 우방 점검 (5두 이상 발열 여부)

**2 ~ 24시간**:
- WOAH 신고 의무 질병이면 농림축산식품부 동물방역과 보고
- 반경 3km 내 농장에 자가 점검 권고
- 작업자 보호장구 착용 + 입출 기록

**24 ~ 48시간**:
- 역학조사반 도착, 시료 채취
- 항원·항체 검사 (FMD 항원, 럼피스킨 PCR, BSE 신경조직)
- 살처분 결정 대기 (양성 시 500m / 3km / 10km 단계)

도구 호출 권장: query_quarantine_dashboard, query_national_situation, query_animal_events.

농장주 답변 톤: 패닉 유발 금지, 단계별 명확한 행동 지시. "지금 30분 안에 ~ 하시고,
저는 그 사이 인근 농장 상황 정리해드릴게요" 식.
`;

const BREEDING_DIAGNOSIS_SOP = `

## 활성 Skill — 번식 종합 진단

사용자가 번식 진단·평가·점검을 요청했습니다.

1) **데이터 수집 (병렬)**:
   - query_breeding_stats — 농장 번식 KPI
   - query_conception_stats — 정액별·개체별 수태율
   - query_animal_events — 발정·수정·임신감정·유산 패턴

2) **5대 지표 평가 vs 목표**:
   - 수태율: 50%+ 목표
   - 발정탐지율: 70%+ 목표
   - 평균 공태일: 130일 이하
   - 분만간격: 400일 이하
   - 첫수정일수 (분만 후~첫 수정): 80일 이하

3) **이상 신호 파악**:
   - Repeat breeder (3회+ 미수태) — 자궁 검사 필요
   - 장기 공태우 (200일+) — 임신감정 누락 또는 발정 미감지
   - 유산 빈도 — 영양·바이러스성·관리 요인

4) **개선 액션**:
   - 발정 동기화 프로토콜 (Ovsynch·CIDR·G6G) 적용 후보 개체
   - 정액 추천: recommend_insemination_window 도구 활용
   - 임신감정 예약 누락 개체 리스트

음성 톤 — 한 마리 깊이 들어가기보다 농장 전체 패턴 한 줄 + "어느 개체부터 자세히 보실래요?"
`;

const FEEDING_REVIEW_SOP = `

## 활성 Skill — 사양 종합 평가

사용자가 사양·사료·환경 평가를 요청했습니다.

1) **데이터 수집**:
   - query_sensor_data — 음수·반추·활동 (사료 섭취 간접 지표)
   - query_weather — THI 열스트레스 + 환기 필요성
   - 우유 검정 성적표 첨부 시 SCC·MUN·유지방·유단백 분석

2) **평가 영역**:
   - **사료 효율**: 반추 시간 300~600분 정상, 그 이하면 정밀도 부족
   - **수분 섭취**: 일 40~120L 정상, 부족 시 사료 섭취·우유 생산 영향
   - **열스트레스**: THI 72+ 경도, 80+ 중등도, 90+ 위험
   - **균질도**: 우방 내 개체 간 편차 (체형 점수 BCS 분포)

3) **개선 권고**:
   - TMR 조정 (NDF/ADF/CP/전분)
   - 환기·차광·물공급 개선
   - 전환기 영양 (분만 전후 21일)

음성 톤 — 가장 큰 문제 1개 + 즉시 개선책 + 효과 예측. 길게 나열하지 않음.
`;

export const SKILLS: readonly Skill[] = [
  {
    id: 'monthly-audit',
    title: '월간 농장 감사',
    triggers: [/월간\s*(감사|평가|리뷰|보고)/i, /monthly\s*(audit|review|report)/i, /이번\s*달\s*(평가|감사)/i],
    systemAddendum: MONTHLY_AUDIT_SOP,
  },
  {
    id: 'epidemic-sop',
    title: '전염병 대응 SOP',
    triggers: [/전염병|법정\s*전염병|구제역|럼피스킨|FMD|brucella|HPAI/i, /방역\s*(대응|SOP|신고)/i, /epidemic\s*(response|sop)/i],
    systemAddendum: EPIDEMIC_SOP_SOP,
  },
  {
    id: 'breeding-diagnosis',
    title: '번식 종합 진단',
    triggers: [/번식\s*(진단|평가|점검|종합)/i, /수태율\s*분석/i, /breeding\s*(diagnosis|audit)/i],
    systemAddendum: BREEDING_DIAGNOSIS_SOP,
  },
  {
    id: 'feeding-review',
    title: '사양 종합 평가',
    triggers: [/사양\s*(평가|진단|점검)/i, /사료\s*(평가|진단)/i, /환경\s*평가/i, /feeding\s*(review|audit)/i],
    systemAddendum: FEEDING_REVIEW_SOP,
  },
];

export function detectSkill(question: string): Skill | null {
  for (const skill of SKILLS) {
    if (skill.triggers.some((re) => re.test(question))) return skill;
  }
  return null;
}
