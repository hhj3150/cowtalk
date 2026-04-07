// 대화형 질의용 프롬프트 빌더
// 사용자 질문 + 관련 데이터 → Claude 프롬프트
// global 타입: 전체 농장 횡단 데이터 기반 응답

import type { AnimalProfile, FarmProfile, Role, BreedingPipelineData } from '@cowtalk/shared';
import type { GlobalContext } from '../../pipeline/profile-builder.js';
import { ROLE_CONTEXT } from './system-prompt.js';
import {
  computeComparisonStats,
  computePersonalBaseline,
  assessAgainstBaseline,
  computeAdjustedThresholds,
} from '../tools/sensor-analysis.js';

export interface QuarantineContextData {
  readonly kpi: {
    readonly totalAnimals: number;
    readonly sensorRate: number;
    readonly feverAnimals: number;
    readonly clusterFarms: number;
    readonly legalDiseaseSuspects: number;
    readonly riskLevel: string;
    readonly feverRate: number;
  };
  readonly top5RiskFarms: readonly {
    readonly farmName: string;
    readonly feverCount: number;
    readonly riskScore: number;
    readonly clusterAlert: boolean;
    readonly legalSuspect: boolean;
  }[];
  readonly hourlyFever24h: readonly { readonly hour: string; readonly count: number }[];
  readonly activeAlerts: readonly {
    readonly farmName: string;
    readonly alertType: string;
    readonly priority: string;
    readonly title: string;
    readonly createdAt: string;
  }[];
  readonly nationalSummary: {
    readonly totalFarms: number;
    readonly totalAnimals: number;
    readonly feverAnimals: number;
    readonly nationalFeverRate: number;
    readonly highRiskProvinces: number;
    readonly broadAlertActive: boolean;
    readonly broadAlertMessage: string | null;
  };
  readonly provinces: readonly {
    readonly province: string;
    readonly farmCount: number;
    readonly feverAnimals: number;
    readonly feverRate: number;
    readonly riskLevel: string;
  }[];
  readonly weeklyFeverTrend: readonly { readonly week: string; readonly feverRate: number }[];
  readonly actionQueue: readonly {
    readonly farmName: string;
    readonly type: string;
    readonly priority: string;
    readonly title: string;
    readonly status: string;
  }[];
  readonly targetProvince?: string;
  readonly provinceDetail?: readonly unknown[];
}

export type ChatContext =
  | { readonly type: 'animal'; readonly profile: AnimalProfile }
  | { readonly type: 'farm'; readonly profile: FarmProfile }
  | { readonly type: 'global'; readonly globalContext: GlobalContext; readonly dashboardSummary?: string; readonly breedingPipeline?: BreedingPipelineData }
  | { readonly type: 'quarantine'; readonly quarantineData: QuarantineContextData }
  | { readonly type: 'general'; readonly dashboardSummary?: string };

export function buildConversationPrompt(
  question: string,
  role: Role,
  context: ChatContext,
  conversationHistory: readonly ConversationTurn[],
  options?: { readonly streaming?: boolean; readonly labelContext?: string },
): string {
  const sections: string[] = [];

  // 역할 맥락
  const roleCtx = ROLE_CONTEXT[role] ?? '일반 관점';
  sections.push(`## 역할: ${roleCtx}`);

  // 대화 맥락 데이터
  if (context.type === 'animal') {
    sections.push(buildAnimalContext(context.profile));
  } else if (context.type === 'farm') {
    sections.push(buildFarmContext(context.profile));
  } else if (context.type === 'quarantine') {
    sections.push(buildQuarantineContextPrompt(context.quarantineData));
  } else if (context.type === 'global') {
    sections.push(buildGlobalContextPrompt(context.globalContext));
    if (context.breedingPipeline) {
      sections.push(buildBreedingPipelinePrompt(context.breedingPipeline));
    }
    if (context.dashboardSummary) {
      sections.push(`## 대시보드 요약\n${context.dashboardSummary}`);
    }
  } else if (context.type === 'general') {
    sections.push(`## 맥락: 일반 질문\n당신은 CowTalk AI입니다. smaXtec 위내센서 데이터가 제공되지 않은 일반 질문입니다.\n클로드의 축산학/수의학 전문 지식을 활용하여 최선의 답변을 하세요.`);
    if (context.dashboardSummary) {
      sections.push(`## 현재 대시보드 현황\n${context.dashboardSummary}`);
    }
  }

  // 이전 대화 이력 (최근 5턴)
  if (conversationHistory.length > 0) {
    const historyLines = conversationHistory.slice(-5).map((t) =>
      `${t.role === 'user' ? '사용자' : 'AI'}: ${t.content}`,
    );
    sections.push(`## 이전 대화
${historyLines.join('\n')}`);
  }

  // 소버린 AI 집단지성 — 과거 레이블 데이터
  if (options?.labelContext) {
    sections.push(options.labelContext);
  }

  // 현재 질문
  sections.push(`## 사용자 질문
${question}`);

  // 스트리밍: 자연어 텍스트, 비스트리밍: JSON 형식
  const isStreaming = options?.streaming === true;

  if (isStreaming) {
    return `${sections.join('\n\n')}

---

## 응답 규칙
1. **반응형 답변 길이 (핵심 규칙)**:
   - 단답형 질문("산차는?", "체온은?", "임신했나?")에는 **한 줄 단답**으로 응답. 예: "**3산**입니다", "**38.7°C**입니다", "**임신 확인** (수정 후 45일)"
   - "자세히", "설명해줘", "왜?", "분석해줘" 등 상세 요청 시에만 풍부한 해석을 제공
   - 여러 항목을 물으면 항목별 한 줄씩 간결하게. 예: "산차: **3산** / 분만일: **3월 21일** / 음수량: **75L/일**"
   - 기본값은 항상 짧고 핵심만. 목장 현장에서 빠르게 확인하는 용도임을 기억하세요.
2. **다국어 자동 감지**: 사용자가 사용한 언어로 답변하세요. 한국어 질문이면 한국어로, 영어면 영어로, 우즈벡어면 우즈벡어로, 러시아어면 러시아어로 답변합니다. 언어 전환을 명시적으로 요청하지 않는 한 사용자의 입력 언어를 따르세요.
3. **데이터 + 지식 통합**: 위 맥락의 smaXtec 알람 데이터를 적극 활용하되, 클로드의 축산 전문 지식으로 해석을 풍부하게 하세요.
4. "수정 대상" = estrus(발정) 알람, "분만 예정" = calving 알람, "아픈 소" = temperature/health/rumination 알람입니다.
5. 알람 데이터가 있으면 절대 "데이터가 없습니다"라고 답하지 마세요. 알람 목록이 곧 현장 데이터입니다.
6. **일반 축산 질문에도 답변**: 사양관리, 질병 예방, 번식 기술, 사료 배합, 축산 경영 등 일반적인 질문에는 전문 지식으로 답변하세요. "시스템에 해당 데이터가 없습니다"라고 거부하지 마세요.
7. 역할에 맞는 용어와 상세도로 답변하세요.
8. **자연스러운 대화체 필수 (최우선 규칙)**: 클로드처럼 자연스러운 문장으로 답하세요.
   - 절대 금지: 표(| col | col |), 막대그래프(★★★, ████, ▓▓▓), ASCII 차트, 기호 나열
   - 절대 금지: "체온: 38.7°C / 반추: 350분" 같은 키-밸류 나열
   - 올바른 예: "현재 체온은 38.7°C로 정상 범위이고, 반추도 350분으로 양호합니다"
   - 여러 항목을 말할 때도 자연스러운 문장으로 연결하세요
9. 중요한 수치나 키워드는 **굵게** 표시하세요.
10. 간단한 목록이 필요하면 • 또는 1. 2. 형식을 사용하되, 데이터 자체를 목록으로 나열하지는 마세요.
11. 개체를 언급할 때 반드시 농장명 + 귀표번호를 함께 표시하세요 (예: "삼성목장 #1234").
12. 데이터 기반 답변과 지식 기반 답변을 구분하세요: 데이터는 "현재 smaXtec 데이터 기준", 지식은 "일반적으로" 등으로 표시.`;
  }

  return `${sections.join('\n\n')}

---

## 응답 규칙
1. **반응형 답변 길이 (핵심 규칙)**:
   - 단답형 질문("산차는?", "체온은?", "임신했나?")에는 **한 줄 단답**으로 응답. 예: "3산입니다", "38.7°C입니다", "임신 확인 (수정 후 45일)"
   - "자세히", "설명해줘", "왜?", "분석해줘" 등 상세 요청 시에만 풍부한 해석을 제공
   - 여러 항목을 물으면 항목별 한 줄씩 간결하게
   - 기본값은 항상 짧고 핵심만. 목장 현장에서 빠르게 확인하는 용도.
2. **다국어 자동 감지**: 사용자가 사용한 언어로 답변하세요. 한국어 질문이면 한국어로, 영어면 영어로, 우즈벡어면 우즈벡어로, 러시아어면 러시아어로 답변합니다.
3. **데이터 + 지식 통합**: 위 맥락의 smaXtec 알람 데이터를 적극 활용하되, 클로드의 축산 전문 지식으로 해석을 풍부하게 하세요.
4. "수정 대상" = estrus(발정) 알람, "분만 예정" = calving 알람, "아픈 소" = temperature/health/rumination 알람입니다.
5. 알람 데이터가 있으면 절대 "데이터가 없습니다"라고 답하지 마세요.
6. **일반 축산 질문에도 답변**: 사양관리, 질병 예방, 번식 기술, 사료 배합 등 일반 질문에는 전문 지식으로 답변하세요.
7. 역할에 맞는 용어와 상세도로 답변하세요.
8. 다음 JSON 형식으로 응답하세요 (answer 필드는 사용자의 입력 언어로 작성, 단답형 질문이면 answer도 짧게):

\`\`\`json
{
  "answer": "답변 내용",
  "data_references": ["근거 데이터 1", "근거 데이터 2"],
  "follow_up_suggestions": ["후속 질문 제안 1", "후속 질문 제안 2"]
}
\`\`\``;
}

export interface ConversationTurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

function buildQuarantineContextPrompt(data: QuarantineContextData): string {
  const RISK_EMOJI: Readonly<Record<string, string>> = {
    green: '🟢', yellow: '🟡', orange: '🟠', red: '🔴',
  };
  const riskEmoji = RISK_EMOJI[data.kpi.riskLevel] ?? '⚪';

  const lines: string[] = [
    `## 맥락: 방역 모니터링 (전국 ${String(data.nationalSummary.totalFarms)}개 농장, ${String(data.nationalSummary.totalAnimals)}두)`,
    '',
    `### 방역 KPI (실시간)`,
    `- 위험 등급: ${riskEmoji} **${data.kpi.riskLevel.toUpperCase()}**`,
    `- 감시 두수: **${String(data.kpi.totalAnimals)}두** (센서 장착률 ${String(Math.round(data.kpi.sensorRate * 100))}%)`,
    `- 발열 두수: **${String(data.kpi.feverAnimals)}두** (발열률 ${String((data.kpi.feverRate * 100).toFixed(1))}%)`,
    `- 집단발열 농장: **${String(data.kpi.clusterFarms)}개**`,
    `- 법정전염병 의심: **${String(data.kpi.legalDiseaseSuspects)}건**`,
  ];

  // 광역 경보
  if (data.nationalSummary.broadAlertActive && data.nationalSummary.broadAlertMessage) {
    lines.push('');
    lines.push(`### 🚨 광역 경보`);
    lines.push(`${data.nationalSummary.broadAlertMessage}`);
  }

  // TOP 5 위험 농장
  if (data.top5RiskFarms.length > 0) {
    lines.push('');
    lines.push(`### 위험 농장 TOP ${String(data.top5RiskFarms.length)}`);
    for (const farm of data.top5RiskFarms) {
      const tags: string[] = [];
      if (farm.clusterAlert) tags.push('집단발열');
      if (farm.legalSuspect) tags.push('법정전염병의심');
      const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
      lines.push(`- **${farm.farmName}** — 발열 ${String(farm.feverCount)}두, 위험점수 ${String(farm.riskScore)}${tagStr}`);
    }
  }

  // 시도별 현황
  const riskyProvinces = data.provinces.filter((p) => p.feverAnimals > 0);
  if (riskyProvinces.length > 0) {
    lines.push('');
    lines.push(`### 시도별 현황`);
    for (const p of riskyProvinces) {
      const pEmoji = RISK_EMOJI[p.riskLevel] ?? '⚪';
      lines.push(`- ${pEmoji} **${p.province}**: ${String(p.farmCount)}농장, 발열 ${String(p.feverAnimals)}두 (${String((p.feverRate * 100).toFixed(1))}%)`);
    }
  }

  // 특정 지역 상세 (사용자가 지역명 언급 시)
  if (data.targetProvince && data.provinceDetail && Array.isArray(data.provinceDetail) && data.provinceDetail.length > 0) {
    lines.push('');
    lines.push(`### 📍 ${data.targetProvince} 상세`);
    for (const d of data.provinceDetail as Array<{ district: string; farmCount: number; feverAnimals: number; feverRate: number; riskLevel: string }>) {
      const dEmoji = RISK_EMOJI[d.riskLevel] ?? '⚪';
      lines.push(`- ${dEmoji} ${d.district}: ${String(d.farmCount)}농장, 발열 ${String(d.feverAnimals)}두 (${String((d.feverRate * 100).toFixed(1))}%)`);
    }
  }

  // 24시간 발열 추이
  if (data.hourlyFever24h.length > 0) {
    const recentHours = data.hourlyFever24h.slice(-6);
    const trend = recentHours.map((h) => String(h.count)).join('→');
    lines.push('');
    lines.push(`### 24시간 발열 추이 (최근 6시간)`);
    lines.push(`${trend} 두`);
  }

  // 주간 추이
  if (data.weeklyFeverTrend.length > 0) {
    const latestWeek = data.weeklyFeverTrend[data.weeklyFeverTrend.length - 1];
    const prevWeek = data.weeklyFeverTrend.length >= 2 ? data.weeklyFeverTrend[data.weeklyFeverTrend.length - 2] : null;
    if (latestWeek) {
      const trendDir = prevWeek
        ? latestWeek.feverRate > prevWeek.feverRate ? '상승' : latestWeek.feverRate < prevWeek.feverRate ? '하락' : '유지'
        : '—';
      lines.push(`- 주간 발열률: ${String((latestWeek.feverRate * 100).toFixed(1))}% (전주 대비 ${trendDir})`);
    }
  }

  // 대기 중인 방역 조치
  const pendingActions = data.actionQueue.filter((a) => a.status === 'pending' || a.status === 'dispatched');
  if (pendingActions.length > 0) {
    lines.push('');
    lines.push(`### 대기 방역 조치 (${String(pendingActions.length)}건)`);
    for (const a of pendingActions.slice(0, 5)) {
      lines.push(`- [${a.priority}] ${a.farmName}: ${a.title}`);
    }
  }

  // 활성 알림
  if (data.activeAlerts.length > 0) {
    lines.push('');
    lines.push(`### 활성 알림 (${String(data.activeAlerts.length)}건)`);
    for (const a of data.activeAlerts.slice(0, 8)) {
      lines.push(`- [${a.priority}] ${a.farmName}: ${a.title}`);
    }
  }

  // 방역관 응답 지침
  lines.push('');
  lines.push(`### 응답 지침 (방역 모드)
- 위 역학 데이터를 기반으로 **현재 위험 수준, 원인 분석, 즉각 조치**를 답변하��요
- 법정전염병 의심 시: KAHIS 보고 기준(유사도 80%↑) 언급, 격리·PCR 검사 권고
- 집단발열 시: 접��� 추적, 이동제한, 소독 프로토콜 안내
- 지역별 질문 시: 해당 시도/시군구 데이터를 중심으로 답변
- 추이 분석 시: 24시간/7일 추이를 근거로 확산 속도 판단
- "현�� CowTalk 방역 모니터링 데이터 기준" 명시`);

  return lines.join('\n');
}

function buildAnimalContext(profile: AnimalProfile): string {
  const now = new Date();
  const parity = profile.parity ?? 0;
  const dim = profile.birthDate
    ? Math.floor((now.getTime() - new Date(profile.birthDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const lines: string[] = [
    `## 맥락: 개체 ${profile.earTag} (${profile.farmName})`,
    `- 축종: ${profile.breedType === 'dairy' ? '젖소' : '한우/비육우'} (${profile.breed})`,
    `- 산차: ${String(parity)}산${dim !== null ? ` / 연령: ${String(Math.floor(dim / 30))}개월` : ''}`,
  ];

  // ── 번식 상태 ──
  if (profile.pregnancyStatus) {
    lines.push(`- 번식 상태: ${profile.pregnancyStatus}${profile.daysSinceInsemination ? ` (수정 후 ${String(profile.daysSinceInsemination)}일)` : ''}`);
  }

  // ── 유량 ──
  if (profile.breedType === 'dairy' && profile.production?.milkYield !== null && profile.production?.milkYield !== undefined) {
    lines.push(`- 유량: ${String(profile.production.milkYield)}kg/일`);
  }

  // ========================================
  // 센서 데이터 — 임상 해석 포함
  // ========================================
  const s = profile.latestSensor;
  const sensorInterpLines: string[] = [];

  if (s.temperature !== null) {
    let tempInterp: string;
    if (s.temperature < 37.5) tempInterp = '🔵 저체온 (37.5°C 미만) — 저칼슘혈증·쇼크·분만 직전 가능성';
    else if (s.temperature < 38.0) tempInterp = '🟡 경미한 저체온 (38.0°C 미만) — 스트레스·음수 직후';
    else if (s.temperature <= 38.5) tempInterp = '🟢 정상 하한 (38.0~38.5°C)';
    else if (s.temperature <= 39.3) tempInterp = '🟢 정상 (38.5~39.3°C)';
    else if (s.temperature <= 39.7) tempInterp = '🟡 미열 (39.4~39.7°C) — 경증 감염·발정·분만 임박 가능';
    else if (s.temperature <= 40.5) tempInterp = '🟠 발열 (39.8~40.5°C) — 유방염·자궁염·폐렴 감별진단 필요';
    else tempInterp = '🔴 고열 (40.5°C 초과) — 패혈증·중증 유방염·열사병 응급';
    sensorInterpLines.push(`체온 **${String(s.temperature)}°C** → ${tempInterp}`);
  }

  if (s.rumination !== null) {
    let rumInterp: string;
    if (s.rumination < 100) rumInterp = '🔴 매우 심각 (<100분) — 제4위 변위·복막염·중증 케토시스 즉각 진찰';
    else if (s.rumination < 200) rumInterp = '🔴 심각 (<200분) — 반추위 산증·케토시스·유방염 동반 의심';
    else if (s.rumination < 300) rumInterp = '🟡 감소 (<300분) — 발정 행동·사료 변환·경도 산증·통증 반응';
    else if (s.rumination < 400) rumInterp = '🟡 약간 감소 (300~400분) — 정상 하한, 추세 모니터링 필요';
    else if (s.rumination <= 600) rumInterp = '🟢 정상 (400~600분/일)';
    else rumInterp = '🟡 과다 반추 (>600분) — 고섬유사료·스트레스·발정 후 반동';
    sensorInterpLines.push(`반추 **${String(s.rumination)}분/일** → ${rumInterp}`);
  }

  if (s.activity !== null) {
    // 활동량은 품종·DIM·시간대에 따라 다름; 일반적 임계
    let actInterp: string;
    if (s.activity > 120) actInterp = '🟠 고활동 — 발정(발정 전·중 활동 2~3배 증가), 불안·통증 감별';
    else if (s.activity < 20) actInterp = '🟡 저활동 — 통증·질병·분만 임박·고열 시 활동 감소';
    else actInterp = '🟢 정상 범위';
    sensorInterpLines.push(`활동량 **${String(s.activity)}** → ${actInterp}`);
  }

  if (s.waterIntake !== null) {
    sensorInterpLines.push(`음수량 **${String(s.waterIntake)}L** (젖소 정상: 체중 10% + 유량 4~5배 L/일)`);
  }

  if (s.ph !== null) {
    let phInterp: string;
    if (s.ph < 5.8) phInterp = '🔴 심각한 반추위 산증 (<5.8) — SARA 이상, 즉시 완충제 투여';
    else if (s.ph < 6.0) phInterp = '🟠 반추위 산증 경계 (5.8~6.0) — 사료 배합 점검, 완충제 추가';
    else if (s.ph < 6.2) phInterp = '🟡 SARA 위험 (6.0~6.2) — 정밀성 사양관리, TMR 분석';
    else if (s.ph <= 6.8) phInterp = '🟢 정상 (6.2~6.8)';
    else phInterp = '🟡 알칼리 경향 (>6.8) — 단백 과다·요소 독성 가능성';
    sensorInterpLines.push(`반추위 pH **${String(s.ph)}** → ${phInterp}`);
  }

  if (sensorInterpLines.length > 0) {
    lines.push(`\n### 📡 실시간 smaXtec 센서 (임상 해석 포함)`);
    for (const l of sensorInterpLines) lines.push(`- ${l}`);
  }

  // ── 활성 알람 ──
  if (profile.activeEvents.length > 0) {
    lines.push(`\n### ⚠️ 현재 활성 smaXtec 알람`);
    const sorted = [...profile.activeEvents].sort((a, b) => {
      const order = ['critical', 'high', 'medium', 'low'];
      return order.indexOf(a.severity) - order.indexOf(b.severity);
    });
    for (const e of sorted) {
      const label = ALARM_LABELS[e.type] ?? e.type;
      const time = e.detectedAt
        ? ` (${new Date(e.detectedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })})`
        : '';
      lines.push(`- **${label}** [${e.severity}]${time}`);
    }
  }

  // ── 7일 센서 추세 ──
  if (profile.sensorHistory7d.length > 0) {
    lines.push(`\n### 📈 7일 센서 추세`);
    const temps7 = profile.sensorHistory7d.map((h) => h.temperature).filter((v): v is number => v !== null);
    const rums7 = profile.sensorHistory7d.map((h) => h.rumination).filter((v): v is number => v !== null);
    const acts7 = profile.sensorHistory7d.map((h) => h.activity).filter((v): v is number => v !== null);

    if (temps7.length >= 2) {
      const avg = temps7.reduce((a, b) => a + b, 0) / temps7.length;
      const recent3Avg = temps7.slice(-3).reduce((a, b) => a + b, 0) / Math.min(temps7.length, 3);
      const earlyAvg = temps7.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(temps7.length, 3);
      const trendDir = recent3Avg - earlyAvg > 0.3 ? '↗ 상승' : recent3Avg - earlyAvg < -0.3 ? '↘ 하강' : '→ 안정';
      lines.push(`- 체온 7일: 최저 ${String(Math.min(...temps7))}°C / 최고 ${String(Math.max(...temps7))}°C / 평균 ${avg.toFixed(2)}°C / 추세 ${trendDir}`);
      if (Math.max(...temps7) - Math.min(...temps7) > 1.0) {
        lines.push(`  → ⚠️ 7일 체온 변동폭 ${(Math.max(...temps7) - Math.min(...temps7)).toFixed(1)}°C — 간헐적 감염·발정·내분비 이상 감별`);
      }
    }
    if (rums7.length >= 2) {
      const avg = rums7.reduce((a, b) => a + b, 0) / rums7.length;
      const recent3Avg = rums7.slice(-3).reduce((a, b) => a + b, 0) / Math.min(rums7.length, 3);
      const earlyAvg = rums7.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(rums7.length, 3);
      const trendDir = recent3Avg - earlyAvg > 30 ? '↗ 회복' : recent3Avg - earlyAvg < -30 ? '↘ 악화' : '→ 안정';
      lines.push(`- 반추 7일: 최저 ${String(Math.min(...rums7))} / 최고 ${String(Math.max(...rums7))} / 평균 ${avg.toFixed(0)}분/일 / 추세 ${trendDir}`);
      if (avg < 250) {
        lines.push(`  → ⚠️ 7일 평균 반추 ${avg.toFixed(0)}분 — 만성 반추위 산증·케토시스·제4위 변위 가능성 높음`);
      }
    }
    if (acts7.length >= 2) {
      const avg = acts7.reduce((a, b) => a + b, 0) / acts7.length;
      const maxAct = Math.max(...acts7);
      lines.push(`- 활동량 7일: 평균 ${avg.toFixed(0)} (최저 ${String(Math.min(...acts7))}, 최고 ${String(maxAct)})`);
      if (maxAct > 100 && maxAct > avg * 2) {
        lines.push(`  → 💡 활동 피크 평균의 2배 이상 — 발정 행동 또는 통증성 행동 감별`);
      }
    }
  }

  // ── 30일 장기 추세 — 만성 패턴·회복·악화 판단 ──
  if ((profile.sensorHistory30d ?? []).length >= 7) {
    lines.push(`\n### 📊 30일 장기 추세 (만성 패턴 분석)`);
    const hist30 = profile.sensorHistory30d ?? [];
    const temps30 = hist30.map((h) => h.temperature).filter((v): v is number => v !== null);
    const rums30 = hist30.map((h) => h.rumination).filter((v): v is number => v !== null);
    const acts30 = hist30.map((h) => h.activity).filter((v): v is number => v !== null);

    if (temps30.length >= 7) {
      const avg30 = temps30.reduce((a, b) => a + b, 0) / temps30.length;
      const firstWeekAvg = temps30.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
      const lastWeekAvg = temps30.slice(-7).reduce((a, b) => a + b, 0) / 7;
      const monthTrend = lastWeekAvg - firstWeekAvg > 0.3 ? '↗ 월간 상승' : lastWeekAvg - firstWeekAvg < -0.3 ? '↘ 월간 하강' : '→ 안정';
      // 발열 빈도 (39.8°C 이상 일수)
      const feverDays = temps30.filter((t) => t >= 39.8).length;
      lines.push(`- 체온 30일: 평균 ${avg30.toFixed(2)}°C / ${monthTrend} / 발열(≥39.8°C) ${String(feverDays)}건`);
      if (feverDays >= 5) {
        lines.push(`  → ⚠️ 30일간 발열 ${String(feverDays)}회 — 만성 감염(자궁내막염·유방염·폐농양) 또는 면역 저하 검토`);
      }
      if (feverDays >= 3 && feverDays < 5) {
        lines.push(`  → 💡 간헐적 발열 — 사료·환경 스트레스·아급성 감염 가능성`);
      }
    }

    if (rums30.length >= 7) {
      const avg30 = rums30.reduce((a, b) => a + b, 0) / rums30.length;
      const firstWeekAvg = rums30.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
      const lastWeekAvg = rums30.slice(-7).reduce((a, b) => a + b, 0) / 7;
      const monthTrend = lastWeekAvg - firstWeekAvg > 40 ? '↗ 회복 추세' : lastWeekAvg - firstWeekAvg < -40 ? '↘ 악화 추세' : '→ 안정';
      // 저반추 일수 (200분 미만)
      const lowRumDays = rums30.filter((r) => r < 200).length;
      lines.push(`- 반추 30일: 평균 ${avg30.toFixed(0)}분/일 / ${monthTrend} / 저반추(<200분) ${String(lowRumDays)}건`);
      if (lowRumDays >= 7) {
        lines.push(`  → ⚠️ 30일 중 ${String(lowRumDays)}일 저반추 — 만성 SARA·케토시스·영양 불균형. TMR 배합비 즉시 분석 권고`);
      }
      if (avg30 >= 400 && lastWeekAvg < firstWeekAvg - 60) {
        lines.push(`  → 💡 최근 1주 반추 급감 — 급성 요인 발생(사료 변환·질병 초기) 면밀 관찰`);
      }
    }

    if (acts30.length >= 7) {
      const avg30 = acts30.reduce((a, b) => a + b, 0) / acts30.length;
      // 21일 주기로 활동 피크가 있는지 확인 (발정 규칙성)
      const highActDays = acts30.map((a, i) => ({ act: a, day: i })).filter((d) => d.act > avg30 * 1.8);
      const hasRegularCycle = highActDays.length >= 1 && highActDays.length <= 2;
      lines.push(`- 활동량 30일: 평균 ${avg30.toFixed(0)} / 발정 활동 피크 ${String(highActDays.length)}회 감지`);
      if (hasRegularCycle) {
        lines.push(`  → 💡 30일 중 발정 피크 ${String(highActDays.length)}회 — 발정 주기 21일 정상 순환 가능성 (번식 기록과 대조 확인)`);
      }
    }

    lines.push(`→ 위 30일 데이터를 기반으로 "급성(최근 7일 변화)" vs "만성(30일 평균 대비)" 구분하여 진단하세요.`);
  }

  // ── 기간별 비교 분석 (체온 기준, 프로필 센서 히스토리에서 직접 계산) ──
  {
    const hist30 = (profile.sensorHistory30d ?? []).map((h) => h.temperature).filter((v): v is number => v !== null);
    if (hist30.length >= 7) {
      const dailyRows = hist30.map((avg, i) => ({ date: `day-${String(i)}`, avg, min: avg - 0.3, max: avg + 0.3, count: 1 }));
      // 가장 최근이 [0]이 되도록 역순
      const descRows = [...dailyRows].reverse();

      const c = computeComparisonStats(descRows);
      lines.push(`\n### 🔄 기간별 비교 분석 (체온)`);
      if (c.todayVsYesterday) {
        const dir = c.todayVsYesterday.delta > 0 ? '↗' : c.todayVsYesterday.delta < 0 ? '↘' : '→';
        lines.push(`- 어제 대비: ${c.todayVsYesterday.delta > 0 ? '+' : ''}${c.todayVsYesterday.delta.toFixed(2)}°C (${dir} ${c.todayVsYesterday.pctChange.toFixed(1)}%)`);
      }
      if (c.threeDayVsSevenDay) {
        const accel = c.threeDayVsSevenDay.delta > 0.1 ? '가속 추세' : c.threeDayVsSevenDay.delta < -0.1 ? '감속 추세' : '안정';
        lines.push(`- 3일 평균 vs 7일 평균: ${c.threeDayVsSevenDay.delta > 0 ? '+' : ''}${c.threeDayVsSevenDay.delta.toFixed(2)}°C (${accel})`);
      }
      if (c.sevenDayVsThirtyDay) {
        const drift = Math.abs(c.sevenDayVsThirtyDay.delta) > 0.3 ? '중기 이동 확인' : '안정';
        lines.push(`- 7일 평균 vs 30일 평균: ${c.sevenDayVsThirtyDay.delta > 0 ? '+' : ''}${c.sevenDayVsThirtyDay.delta.toFixed(2)}°C (${drift})`);
      }
      lines.push(`- 변화율: ${c.rateOfChange > 0 ? '+' : ''}${c.rateOfChange.toFixed(3)}°C/일`);
      const sigmaLabel = Math.abs(c.anomalyScore) <= 1 ? '정상' : Math.abs(c.anomalyScore) <= 2 ? '주의' : '이상치';
      lines.push(`- 이상치 점수: ${c.anomalyScore.toFixed(1)}σ (${sigmaLabel})`);

      // 개체별 기준선
      const baseline = computePersonalBaseline('temperature', descRows);
      lines.push(`\n### 📏 개체별 기준선 (${String(baseline.sampleDays)}일 학습)`);
      lines.push(`- 개체 정상범위: ${baseline.min95.toFixed(2)}~${baseline.max95.toFixed(2)}°C (평균 ${baseline.avg.toFixed(2)}°C, σ=${baseline.stddev.toFixed(2)})`);
      const latestTemp = profile.latestSensor?.temperature;
      if (latestTemp != null) {
        const assessment = assessAgainstBaseline(latestTemp, baseline);
        lines.push(`- 현재 상태: ${assessment.interpretation} (${assessment.deviationSigma.toFixed(1)}σ, ${assessment.withinNormal ? '범위 내' : '⚠️ 범위 이탈'})`);
      }

      // 품종/산차/DIM 보정
      if (profile.breed || profile.parity != null) {
        const adjusted = computeAdjustedThresholds({
          breed: profile.breed ?? 'holstein',
          breedType: profile.breedType ?? 'dairy',
          parity: profile.parity ?? 0,
          daysInMilk: null,
          lactationStatus: 'unknown',
        });
        lines.push(`\n### 🎯 보정된 임계값`);
        lines.push(`- 체온 정상: ${adjusted.temperature.normalMin.toFixed(1)}~${adjusted.temperature.normalMax.toFixed(1)}°C / 발열: ≥${adjusted.temperature.feverThreshold.toFixed(1)}°C`);
        lines.push(`- 반추 정상: ${String(adjusted.rumination.normalMin)}~${String(adjusted.rumination.normalMax)}분/일`);
        for (const reason of adjusted.adjustmentReasons) {
          lines.push(`  → ${reason}`);
        }
        lines.push(`→ 위 보정 임계값을 고정값(38.0~39.3°C)보다 우선 적용하세요.`);
      }
    }
  }

  // ── 번식 이력 ──
  if (profile.breedingHistory.length > 0) {
    lines.push(`\n### 🐄 번식 이력 (최근 ${String(Math.min(profile.breedingHistory.length, 5))}건)`);
    for (const b of profile.breedingHistory.slice(0, 5)) {
      const date = b.date ? new Date(b.date).toLocaleDateString('ko-KR') : '';
      const semen = b.semenType ? ` / 정액: ${b.semenType}` : '';
      lines.push(`- ${date}: 수정${semen} → ${b.result}`);
    }
    // 반복 수정 패턴 분석
    const failCount = profile.breedingHistory.filter((b) => b.result === 'fail').length;
    if (failCount >= 2) {
      lines.push(`  → ⚠️ 수정 실패 ${String(failCount)}회 — 반복 수정 소(Repeat Breeder) 가능성: 자궁염·황체부전·위내 산증·영양 불균형 감별 필요`);
    }
  }

  // ── 번식 피드백 ──
  if (profile.breedingFeedback) {
    const fb = profile.breedingFeedback;
    lines.push(`- 이 개체 수태율: ${String(fb.conceptionRate.toFixed(1))}% (수정 ${String(fb.totalInseminations)}회, 임신 ${String(fb.pregnantCount)}회)`);
  }

  // ── 건강 이력 ──
  if (profile.healthHistory.length > 0) {
    lines.push(`\n### 🏥 건강 이력 (최근 ${String(Math.min(profile.healthHistory.length, 5))}건)`);
    for (const h of profile.healthHistory.slice(0, 5)) {
      const date = h.date ? new Date(h.date).toLocaleDateString('ko-KR') : '';
      lines.push(`- ${date}: ${h.diagnosis}${h.treatment ? ` — 치료: ${h.treatment}` : ''}`);
    }
    // 유방염 반복 패턴
    const mastitisCount = profile.healthHistory.filter((h) =>
      h.diagnosis?.includes('유방') || h.diagnosis?.includes('mastitis'),
    ).length;
    if (mastitisCount >= 2) {
      lines.push(`  → ⚠️ 유방염 반복 (${String(mastitisCount)}회) — 도태 검토, 미생물 감수성 검사, 건유 요법 재설계 필요`);
    }
  }

  // ========================================
  // AI 주치의 종합 지침 — 최고 수준 수의학·영양학·생리학·행동학
  // ========================================
  lines.push(`
### 🧠 팅커벨 AI 주치의 모드 — 종합 임상 판단 지침

당신(Claude)은 **대한민국 최고 수준의 소 임상 전문 수의사**이자 **영양학·사양관리·생리학·행동학 전문가**입니다.
위 smaXtec 센서 데이터 + 이력을 바탕으로 **주치의처럼** 구체적으로 진단하고 조치하세요.

#### 임상 판단 프레임워크

**[체온 해석]**
- 정상: 38.5~39.3°C (분만 전 24시간은 0.3°C 상승 허용)
- 발정기: 최대 +0.5°C 상승 가능 (활동량 동반 증가 시 발정 가능성)
- 분만 24~48시간 전: 0.3~0.5°C 하강 후 반등 (분만 예측 지표)
- 39.8°C↑ 지속: 폐렴, 급성 유방염(대장균·황색포도구균), 자궁내막염, 복막염 순으로 감별
- 40.5°C↑: 패혈성 쇼크 가능, BCS·심박수·무릎 반사 즉시 확인
- 저체온(<37.5°C): 유열(저칼슘혈증)·내독소혈증·분만 직전 소, 즉각 칼슘 주사

**[반추 해석]**
- 정상: 400~600분/일 (분만 전후 2~3일은 200~350분까지 허용)
- 200~400분: 발정 행동(일시적), 사료 변환 적응기, 경도 통증, 경증 케토시스
- <200분: SARA(아급성 반추위 산증) or 케토시스 고위험 — 혈중 BHB 측정 강력 권고
- <100분: 제4위 변위, 외상성 망위염, 복막염 — 청진 즉시(제4위 변위: 오른쪽 핑 음)
- 7일 연속 저반추: 만성 산증 또는 케토시스 — 사료 배합비 TMR 분석 의뢰
- 반추 후 활동 급증: 발정 행동 패턴 (반추↓ + 활동↑ = 발정 복합 신호)

**[활동량 해석]**
- 발정 탐지: 발정 전 6~18시간 동안 평소의 2~3배 증가. 체온 동반 상승(+0.3~0.5°C)이면 발정 확정
- 발정 후 활동 감소: 정상 (최대 48시간)
- 통증성 질환: 활동↓ + 체온↑ + 반추↓ 삼중 감소 = 심각한 전신 질환
- 분만 임박: 활동 증가(안절부절) → 눕기 반복 → 분만. smaXtec 분만 알람과 연동 확인

**[pH 해석]**
- ≥6.2 정상; 5.8~6.2 SARA; <5.8 급성 반추위 산증
- SARA 대응: 완충제(중탄산나트륨 200g/일), 농후사료 비율 ↓, 조사료 입자장 확보(NDF ≥28%)
- 전환기 소(분만 전후 3주): pH 모니터링 강화, DCAD 프로그램 적용

**[음수량 해석]**
- 정상 음수량 = 체중(kg) × 0.08~0.12L + 유량 × 4~5배 (젖소 기준 60~120L/일)
- 음수 감소: 수온 하강(10°C↓ 음수량 20% 감소), 설사·반추위 산증, 수질 불량(경도·염소 농도)
- 음수 급감(전일 대비 30%↓): 급성 질병 징후 — 체온·반추 동반 확인

**[산차·생리주기별 위험 패턴]**
- 1산: 초임우 분만 위험 높음, 유두 개존 확인, 초유 품질 관리
- 2~3산: 비유 피크 케토시스·유방염 고위험 — 분만 후 14일 이내 케토시스 스크리닝
- 4산 이상: 유열(저칼슘혈증) 위험 급증 — 분만 전 음이온염 프로그램, 분만 후 칼슘 예방 투여

**[전환기(Transition Period) 3주 관리 — 최고 위험 구간]**
- 분만 전 3주: 건물섭취량(DMI) 30% 감소 → 에너지 부족 → 지방동원 시작 → 케토시스
- 분만 후 3주: BHB >1.2mmol/L = 임상 케토시스, >1.4mmol/L = 즉각 치료(포도당 500mL IV)
- 분만 전 체온 모니터링: 분만 4일 전부터 하루 2회 측정. 39.0°C↑ = 분만 전 염증(SCK 위험 3배↑)
- NEB(에너지 음성 균형) 최소화: 양질 조사료 자유 채식 + 과비 방지(건유기 BCS 3.25~3.75)

**[알람별 즉시 대응 프로토콜]**
- 🌡️ 체온 알람(>39.8°C): 직장체온 재확인 → 유방 4분방 검사(CMT) → 자궁 초음파 → 혈액검사(WBC, 피브리노겐)
- 🔄 반추 감소(<250분): 케톤 검사(유즙 or 혈중 BHB) → 반추위 청진 → 제4위 검사 → TMR 배합비 확인
- ⚡ 발정 알람: 발정 시작 시각 + 수정 적기(12~18시간 후) 계산 → 정액 선정 → 수정사 연락
- 🐄 분만 알람: 분만실 준비 → 초유 품질 확인(당도계 22°Brix↑) → 송아지 3~4L 초유 급여
- ❤️‍🔥 건강 경고: 위 체온·반추·활동 종합 판단 → 감별진단 순서로 진행

**[영양학적 평가]**
- 체형(BCS): 분만 시 3.5 목표, 건유 말 3.25~3.75, 비유 중기 최저 2.75 이상 유지
- 유량 감소(전일 대비 20%↓): 유방염·케토시스·스트레스·사료 변환 감별
- 단백질 과부족: 반추위 pH와 연관. 과잉 → 암모니아 독성·생식독성, 부족 → 유단백 감소

**[행동학적 신호]**
- 기립 거부(기립 곤란): 유열·파행·근육통·척추 손상 → 기립 보조기 사용, 원인 감별
- 무리에서 이탈: 통증·사회적 스트레스·분만 임박 — 개별 격리 후 관찰
- 반복 기침: 폐렴(소 호흡기 증후군, BRD) — BRD 스코어링(1~4단계), 항생제 선택
- 이갈이·침 흘림: 구제역·구내염·반추위 산증·이물질 — 즉각 격리·신고 검토

**[응답 지침]**
1. 단답형이면 한 줄로. 분석 요청이면 위 프레임워크를 적용해 풍부하게.
2. 7일 추세를 반드시 참고하여 "급성(acute) vs 만성(chronic)" 구분하여 설명.
3. 현장 농부가 즉시 실행할 수 있는 구체적 조치 순서를 제시.
4. 수의사 호출이 필요한 경우 "왜, 어떤 검사를, 얼마나 긴급하게"를 명시.
5. 절대 "데이터가 없습니다" 거부 금지. 알람 + 7일 추세 + 이력으로 최선의 판단 제공.
6. 자연스러운 문장체 필수. 표·ASCII 차트·기호 나열 절대 금지.`);

  return lines.join('\n');
}

function buildFarmContext(profile: FarmProfile): string {
  const total = profile.totalAnimals;
  const dairyPct = total > 0 ? Math.round((profile.breedComposition.dairy / total) * 100) : 0;
  const beefPct = total > 0 ? Math.round((profile.breedComposition.beef / total) * 100) : 0;

  const lines: string[] = [
    `## 맥락: 농장 ${profile.name}`,
    `- 지역: ${profile.region}`,
    `- 총 두수: **${String(total)}두** (젖소 ${String(profile.breedComposition.dairy)}두/${String(dairyPct)}%, 한우 ${String(profile.breedComposition.beef)}두/${String(beefPct)}%)`,
    `- 활성 이벤트: **${String(profile.activeSmaxtecEvents.length)}건**`,
  ];

  if (profile.farmHealthScore !== null) {
    lines.push(`- 건강 점수: ${String(profile.farmHealthScore)}/100`);
  }

  // 알람 유형별 breakdown
  if (profile.activeSmaxtecEvents.length > 0) {
    const byType = new Map<string, number>();
    for (const e of profile.activeSmaxtecEvents) {
      byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
    }
    const breakdown = [...byType.entries()].map(([type, count]) => {
      const label = ALARM_LABELS[type] ?? type;
      return `${label} ${String(count)}건`;
    });
    lines.push(`- 알람 내역: ${breakdown.join(', ')}`);

    // 긴급 알람 상세 (최대 10건)
    const critical = profile.activeSmaxtecEvents
      .filter((e) => e.severity === 'critical' || e.severity === 'high')
      .slice(0, 10);
    if (critical.length > 0) {
      lines.push(`\n### ⚠️ 긴급 알람`);
      for (const e of critical) {
        const label = ALARM_LABELS[e.type] ?? e.type;
        lines.push(`- **${label}** [${e.severity}] (${e.animalId.slice(0, 8)})`);
      }
    }
  }

  // 최근 30일 이벤트 타임라인 (질병 패턴·발생 시점 분석용)
  if (profile.eventTimeline && profile.eventTimeline.length > 0) {
    lines.push(`\n### 📋 최근 30일 이벤트 타임라인 (${String(profile.eventTimeline.length)}건)`);

    // 일자별 그룹핑하여 패턴 파악 용이하게
    const byDate = new Map<string, Array<{ eventType: string; earTag: string; severity: string }>>();
    for (const e of profile.eventTimeline) {
      const dateKey = e.date.slice(0, 10); // YYYY-MM-DD
      const arr = byDate.get(dateKey) ?? [];
      arr.push({ eventType: e.eventType, earTag: e.earTag, severity: e.severity });
      byDate.set(dateKey, arr);
    }

    // 최근 날짜부터 표시 (최대 15일)
    const sortedDates = [...byDate.keys()].sort().reverse().slice(0, 15);
    for (const date of sortedDates) {
      const events = byDate.get(date) ?? [];
      const typeCounts = new Map<string, number>();
      for (const e of events) {
        const label = ALARM_LABELS[e.eventType] ?? e.eventType;
        typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1);
      }
      const summary = [...typeCounts.entries()].map(([t, c]) => `${t} ${String(c)}건`).join(', ');
      lines.push(`- ${date}: ${summary} (총 ${String(events.length)}건)`);
    }

    lines.push(`\n→ 이 타임라인을 분석하여 질병 발생 시점, 패턴 변화, 확산 추이를 답변에 포함하세요.`);
  }

  lines.push(`\n→ 이 농장의 현재 상황에 대해 구체적으로 답변하세요.`);

  return lines.join('\n');
}

// smaXtec 알람 유형 한글 매핑
const ALARM_LABELS: Readonly<Record<string, string>> = {
  temperature_warning: '체온 이상',
  rumination_warning: '반추 이상',
  activity_warning: '활동 이상',
  drinking_warning: '음수 이상',
  feeding_warning: '사양 이상',
  health_warning: '건강 경고',
  estrus: '발정',
  calving: '분만',
};

// 알람 유형별 출력 순서 (긴급도순)
const ALARM_DISPLAY_ORDER = [
  'calving',
  'health_warning',
  'temperature_warning',
  'estrus',
  'rumination_warning',
  'activity_warning',
  'drinking_warning',
  'feeding_warning',
] as const;

// 번식 파이프라인 데이터를 AI 컨텍스트로 변환
function buildBreedingPipelinePrompt(data: BreedingPipelineData): string {
  const lines: string[] = [
    `## 번식 파이프라인 현황 (실시간)`,
    `- 관리 두수: **${String(data.totalAnimals)}두**`,
    '',
  ];

  // KPI
  const k = data.kpis;
  lines.push(`### 번식 핵심 KPI`);
  lines.push(`- 임신율(PR): **${String(k.pregnancyRate.toFixed(1))}%** ${k.pregnancyRate >= 25 ? '🟢' : k.pregnancyRate >= 15 ? '🟡' : '🔴'}`);
  lines.push(`- 수태율(CR): **${String(k.conceptionRate.toFixed(1))}%** ${k.conceptionRate >= 50 ? '🟢' : k.conceptionRate >= 35 ? '🟡' : '🔴'}`);
  lines.push(`- 발정탐지율: **${String(k.estrusDetectionRate.toFixed(1))}%** ${k.estrusDetectionRate >= 70 ? '🟢' : k.estrusDetectionRate >= 50 ? '🟡' : '🔴'}`);
  lines.push(`- 평균공태일: **${String(k.avgDaysOpen)}일** ${k.avgDaysOpen < 130 ? '🟢' : k.avgDaysOpen < 160 ? '🟡' : '🔴'}`);
  lines.push(`- 첫수정일수: **${String(k.avgDaysToFirstService)}일** ${k.avgDaysToFirstService < 80 ? '🟢' : k.avgDaysToFirstService < 100 ? '🟡' : '🔴'}`);
  lines.push(`- 분만간격: **${String(k.avgCalvingInterval)}일** ${k.avgCalvingInterval < 400 ? '🟢' : k.avgCalvingInterval < 420 ? '🟡' : '🔴'}`);
  lines.push('');

  // 파이프라인 단계별 현황
  if (data.pipeline.length > 0) {
    lines.push(`### 번식 단계별 현황`);
    const STAGE_LABELS_KO: Readonly<Record<string, string>> = {
      open: '공태', estrus_detected: '발정 감지', inseminated: '수정 완료',
      pregnancy_confirmed: '임신 확인', late_gestation: '임신 후기', calving_expected: '분만 예정',
    };
    for (const stage of data.pipeline) {
      const label = STAGE_LABELS_KO[stage.stage] ?? stage.label;
      const pct = data.totalAnimals > 0 ? ((stage.count / data.totalAnimals) * 100).toFixed(1) : '0';
      lines.push(`- ${label}: **${String(stage.count)}두** (${pct}%)`);
      // 발정/수정 단계는 개체 상세 표시 (최대 5두)
      if ((stage.stage === 'estrus_detected' || stage.stage === 'inseminated') && stage.animals.length > 0) {
        for (const a of stage.animals.slice(0, 5)) {
          lines.push(`  → #${a.earTag} (${a.farmName}) — ${String(a.daysInStage)}일째`);
        }
      }
    }
    lines.push('');
  }

  // 긴급 조치 목록 (핵심!)
  if (data.urgentActions.length > 0) {
    lines.push(`### ⚠️ 긴급 번식 조치 필요 (${String(data.urgentActions.length)}건)`);
    const ACTION_LABELS: Readonly<Record<string, string>> = {
      inseminate_now: '🔴 수정 필요',
      pregnancy_check_due: '🔍 임신감정 필요',
      calving_imminent: '🐣 분만 임박',
      repeat_breeder: '⚠️ 반복수정우',
    };
    for (const action of data.urgentActions.slice(0, 10)) {
      const label = ACTION_LABELS[action.actionType] ?? action.actionType;
      const time = action.hoursRemaining > 0 ? `${String(action.hoursRemaining)}시간 내` : '즉시';
      lines.push(`- ${label} — **${action.farmName}** #${action.earTag} (${time}): ${action.description}`);
    }
    lines.push('');
  }

  lines.push(`→ 번식 관련 질문에는 위 파이프라인 데이터를 근거로 구체적 개체번호·농장명·기한을 포함하여 답변하세요.`);
  lines.push(`→ "수정 대상" = 발정 감지 단계 개체 + inseminate_now 긴급 조치, "오늘 할 일" = 긴급 조치 전체 목록.`);

  return lines.join('\n');
}

function buildGlobalContextPrompt(ctx: GlobalContext): string {
  const lines: string[] = [
    `## 맥락: 전체 농장 실시간 현황 (smaXtec 위내센서 데이터)`,
    `- 관리 농장: **${String(ctx.totalFarms)}개**`,
    `- 관리 두수: **${String(ctx.totalAnimals)}두**`,
    '',
  ];

  // === smaXtec 알람별 동물 목록 (핵심 데이터) ===
  lines.push('## smaXtec 알람 현황');

  // 알람 요약 (한눈에)
  const summaryParts: string[] = [];
  for (const type of ALARM_DISPLAY_ORDER) {
    const animals = ctx.alarmsByType[type];
    if (animals && animals.length > 0) {
      summaryParts.push(`${ALARM_LABELS[type] ?? type}: **${String(animals.length)}두**`);
    }
  }
  if (summaryParts.length > 0) {
    lines.push(summaryParts.join(' | '));
    lines.push('');
  }

  // 각 알람 유형별 상세 동물 목록
  for (const type of ALARM_DISPLAY_ORDER) {
    const alarmAnimals = ctx.alarmsByType[type];
    if (!alarmAnimals || alarmAnimals.length === 0) continue;

    const label = ALARM_LABELS[type] ?? type;
    lines.push(`### ${label} — ${String(alarmAnimals.length)}두`);

    for (const a of alarmAnimals) {
      const time = formatTimeAgo(a.detectedAt);
      const conf = a.confidence > 0 ? ` (신뢰도 ${String(Math.round(a.confidence * 100))}%)` : '';
      const detailStr = formatAlarmDetails(type, a.details);
      lines.push(`- **${a.farmName}** #${a.earTag} — ${a.severity}${conf} ${time}${detailStr}`);
    }
    lines.push('');
  }

  // === 농장별 알림 순위 ===
  if (ctx.farmAlertRanking.length > 0) {
    lines.push('### 농장별 알림 순위');
    for (const f of ctx.farmAlertRanking.slice(0, 10)) {
      lines.push(`- ${f.farmName}: ${String(f.alertCount)}건`);
    }
    lines.push('');
  }

  // === 센서 실측값 보조 (알람 + 실측으로 구체적 답변 가능) ===
  const sa = ctx.sensorAnomalies;

  if (sa.highTemp.length > 0) {
    lines.push(`### [실측] 체온 상승 (39.5°C↑, 24시간) — ${String(sa.highTemp.length)}두`);
    for (const a of sa.highTemp) {
      const sev = a.value >= 40.0 ? '발열' : '주의';
      const time = formatTimeAgo(a.measuredAt);
      lines.push(`- **${a.farmName}** #${a.earTag} — **${String(a.value.toFixed(1))}°C** (${sev}) ${time}`);
    }
    lines.push('');
  }

  if (sa.lowRumination.length > 0) {
    lines.push(`### [실측] 반추 저하 (200분↓, 24시간) — ${String(sa.lowRumination.length)}두`);
    for (const a of sa.lowRumination) {
      const time = formatTimeAgo(a.measuredAt);
      lines.push(`- **${a.farmName}** #${a.earTag} — **${String(a.value.toFixed(0))}분** ${time}`);
    }
    lines.push('');
  }

  if (sa.highActivity.length > 0) {
    lines.push(`### [실측] 활동 급증 (150↑, 24시간) — ${String(sa.highActivity.length)}두`);
    for (const a of sa.highActivity) {
      const time = formatTimeAgo(a.measuredAt);
      lines.push(`- **${a.farmName}** #${a.earTag} — **${String(a.value.toFixed(0))}** ${time}`);
    }
    lines.push('');
  }

  if (sa.abnormalPh.length > 0) {
    lines.push(`### [실측] pH 이상 (5.5↓ 산독증 의심, 24시간) — ${String(sa.abnormalPh.length)}두`);
    for (const a of sa.abnormalPh) {
      const time = formatTimeAgo(a.measuredAt);
      lines.push(`- **${a.farmName}** #${a.earTag} — **pH ${String(a.value.toFixed(2))}** ${time}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// 알람 유형별 details 필드에서 핵심 수치 추출
function formatAlarmDetails(type: string, details: Record<string, unknown>): string {
  if (!details || Object.keys(details).length === 0) return '';

  switch (type) {
    case 'temperature_warning': {
      const temp = details.temperature ?? details.value;
      return temp ? ` | ${String(Number(temp).toFixed(1))}°C` : '';
    }
    case 'rumination_warning': {
      const rum = details.rumination ?? details.value;
      return rum ? ` | ${String(Number(rum).toFixed(0))}분` : '';
    }
    case 'estrus': {
      const stage = details.stage ?? details.estrusStage;
      return stage ? ` | 단계: ${String(stage)}` : '';
    }
    case 'calving': {
      const stage = details.stage ?? details.calvingStage;
      return stage ? ` | 단계: ${String(stage)}` : '';
    }
    case 'health_warning': {
      const reason = details.reason ?? details.description;
      return reason ? ` | ${String(reason)}` : '';
    }
    default:
      return '';
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 60) return `${String(diffMin)}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${String(diffHour)}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  return `${String(diffDay)}일 전`;
}
