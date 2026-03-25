// 대화형 질의용 프롬프트 빌더
// 사용자 질문 + 관련 데이터 → Claude 프롬프트
// global 타입: 전체 농장 횡단 데이터 기반 응답

import type { AnimalProfile, FarmProfile, Role } from '@cowtalk/shared';
import type { GlobalContext } from '../../pipeline/profile-builder.js';
import { ROLE_CONTEXT } from './system-prompt.js';

export type ChatContext =
  | { readonly type: 'animal'; readonly profile: AnimalProfile }
  | { readonly type: 'farm'; readonly profile: FarmProfile }
  | { readonly type: 'global'; readonly globalContext: GlobalContext; readonly dashboardSummary?: string }
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
  } else if (context.type === 'global') {
    sections.push(buildGlobalContextPrompt(context.globalContext));
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
1. **다국어 자동 감지**: 사용자가 사용한 언어로 답변하세요. 한국어 질문이면 한국어로, 영어면 영어로, 우즈벡어면 우즈벡어로, 러시아어면 러시아어로 답변합니다. 언어 전환을 명시적으로 요청하지 않는 한 사용자의 입력 언어를 따르세요.
2. **데이터 + 지식 통합**: 위 맥락의 smaXtec 알람 데이터를 적극 활용하되, 클로드의 축산 전문 지식으로 해석을 풍부하게 하세요.
3. "수정 대상" = estrus(발정) 알람, "분만 예정" = calving 알람, "아픈 소" = temperature/health/rumination 알람입니다.
4. 알람 데이터가 있으면 절대 "데이터가 없습니다"라고 답하지 마세요. 알람 목록이 곧 현장 데이터입니다.
5. **일반 축산 질문에도 답변**: 사양관리, 질병 예방, 번식 기술, 사료 배합, 축산 경영 등 일반적인 질문에는 전문 지식으로 답변하세요. "시스템에 해당 데이터가 없습니다"라고 거부하지 마세요.
6. 역할에 맞는 용어와 상세도로 답변하세요.
7. 자연스러운 텍스트로 답변하세요. JSON 형식으로 응답하지 마세요.
8. 중요한 수치나 키워드는 **굵게** 표시하세요.
9. 목록은 • 또는 1. 2. 형식을 사용하세요.
10. 개체를 언급할 때 반드시 농장명 + 귀표번호를 함께 표시하세요 (예: "삼성목장 #1234").
11. 데이터 기반 답변과 지식 기반 답변을 구분하세요: 데이터는 "현재 smaXtec 데이터 기준", 지식은 "일반적으로" 등으로 표시.`;
  }

  return `${sections.join('\n\n')}

---

## 응답 규칙
1. **다국어 자동 감지**: 사용자가 사용한 언어로 답변하세요. 한국어 질문이면 한국어로, 영어면 영어로, 우즈벡어면 우즈벡어로, 러시아어면 러시아어로 답변합니다.
2. **데이터 + 지식 통합**: 위 맥락의 smaXtec 알람 데이터를 적극 활용하되, 클로드의 축산 전문 지식으로 해석을 풍부하게 하세요.
3. "수정 대상" = estrus(발정) 알람, "분만 예정" = calving 알람, "아픈 소" = temperature/health/rumination 알람입니다.
4. 알람 데이터가 있으면 절대 "데이터가 없습니다"라고 답하지 마세요.
5. **일반 축산 질문에도 답변**: 사양관리, 질병 예방, 번식 기술, 사료 배합 등 일반 질문에는 전문 지식으로 답변하세요.
6. 역할에 맞는 용어와 상세도로 답변하세요.
7. 다음 JSON 형식으로 응답하세요 (answer 필드는 사용자의 입력 언어로 작성):

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

function buildAnimalContext(profile: AnimalProfile): string {
  const lines: string[] = [
    `## 맥락: 개체 ${profile.earTag} (${profile.farmName})`,
    `- 축종: ${profile.breedType === 'dairy' ? '젖소' : '한우/비육우'} (${profile.breed})`,
    `- 산차: ${String(profile.parity)}`,
  ];

  // ── 센서 데이터 (실시간) ──
  const s = profile.latestSensor;
  const sensorLines: string[] = [];
  if (s.temperature !== null) {
    const tempStatus = s.temperature >= 40.0 ? '🔴 발열' : s.temperature >= 39.5 ? '🟡 주의' : '🟢 정상';
    sensorLines.push(`체온 ${String(s.temperature)}°C (${tempStatus})`);
  }
  if (s.rumination !== null) {
    const rumStatus = s.rumination < 200 ? '🔴 심각 감소' : s.rumination < 300 ? '🟡 감소' : '🟢 정상';
    sensorLines.push(`반추 ${String(s.rumination)}분/일 (${rumStatus})`);
  }
  if (s.activity !== null) sensorLines.push(`활동 ${String(s.activity)}`);
  if (sensorLines.length > 0) lines.push(`- 실시간 센서: ${sensorLines.join(', ')}`);

  // ── 활성 이벤트 (알람) — 가장 중요 ──
  if (profile.activeEvents.length > 0) {
    lines.push(`\n### ⚠️ 현재 활성 알람`);
    // 긴급도순 정렬
    const sorted = [...profile.activeEvents].sort((a, b) => {
      const order = ['critical', 'high', 'medium', 'low'];
      return order.indexOf(a.severity) - order.indexOf(b.severity);
    });
    for (const e of sorted) {
      const label = ALARM_LABELS[e.type] ?? e.type;
      const time = e.detectedAt ? ` (${new Date(e.detectedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })})` : '';
      lines.push(`- **${label}** [${e.severity}]${time}`);
    }
    lines.push(`\n→ 위 알람에 대해 원인 분석, 감별진단, 즉시 조치, 경과 관찰 포인트를 포함하여 답변하세요.`);
  }

  // ── 생산 데이터 ──
  if (profile.breedType === 'dairy' && profile.production?.milkYield !== null) {
    lines.push(`- 유량: ${String(profile.production?.milkYield)}kg`);
  }

  // ── 번식 상태 ──
  if (profile.pregnancyStatus) {
    lines.push(`- 임신 상태: ${profile.pregnancyStatus}`);
  }

  // ── 7일 센서 히스토리 (추세 판단) ──
  if (profile.sensorHistory7d.length > 0) {
    const temps = profile.sensorHistory7d
      .map((h) => h.temperature)
      .filter((v): v is number => v !== null);
    const rums = profile.sensorHistory7d
      .map((h) => h.rumination)
      .filter((v): v is number => v !== null);
    if (temps.length > 0) {
      const recent3 = temps.slice(-3);
      const trend = recent3.length >= 2 && recent3[recent3.length - 1]! > recent3[0]! ? '상승 추세' : '안정';
      lines.push(`- 7일 체온: ${String(Math.min(...temps))}~${String(Math.max(...temps))}°C (${trend}, ${String(temps.length)}건)`);
    }
    if (rums.length > 0) {
      lines.push(`- 7일 반추: ${String(Math.min(...rums))}~${String(Math.max(...rums))}분/일`);
    }
  }

  // ── 번식 이력 ──
  if (profile.breedingHistory.length > 0) {
    lines.push(`\n### 번식 이력 (최근 ${String(Math.min(profile.breedingHistory.length, 5))}건)`);
    for (const b of profile.breedingHistory.slice(0, 5)) {
      const date = b.date ? new Date(b.date).toLocaleDateString('ko-KR') : '';
      const semen = b.semenType ? ` 정액: ${b.semenType}` : '';
      lines.push(`- ${date}: 수정${semen} → ${b.result}`);
    }
  }

  // ── 건강 이력 ──
  if (profile.healthHistory.length > 0) {
    lines.push(`\n### 건강 이력 (최근 ${String(Math.min(profile.healthHistory.length, 5))}건)`);
    for (const h of profile.healthHistory.slice(0, 5)) {
      const date = h.date ? new Date(h.date).toLocaleDateString('ko-KR') : '';
      lines.push(`- ${date}: ${h.diagnosis}${h.treatment ? ` — 치료: ${h.treatment}` : ''}`);
    }
  }

  // ── AI 주치의 지침 ──
  lines.push(`\n### 답변 지침 (주치의 모드)
- 이 소의 현재 상태에 대해 **구체적인 조치**를 알려주세요
- "수의사를 부르세요"만으로는 부족합니다. 어떤 검사를 해야 하고, 의심 질환이 뭔지, 응급 처치는 뭔지 설명하세요
- 새로 설치한 농가의 목장주가 질문한다고 가정하세요 — 경험이 적을 수 있습니다
- 데이터 추세(7일)를 참고하여 급성인지 만성인지 판단하세요`);

  return lines.join('\n');
}

function buildFarmContext(profile: FarmProfile): string {
  const lines: string[] = [
    `## 맥락: 농장 ${profile.name}`,
    `- 지역: ${profile.region}`,
    `- 총 두수: ${String(profile.totalAnimals)}두 (젖소 ${String(profile.breedComposition.dairy)}, 한우 ${String(profile.breedComposition.beef)})`,
    `- 활성 이벤트: ${String(profile.activeSmaxtecEvents.length)}건`,
  ];

  if (profile.farmHealthScore !== null) {
    lines.push(`- 건강 점수: ${String(profile.farmHealthScore)}/100`);
  }

  return lines.join('\n');
}

// smaXtec 알람 유형 한글 매핑
const ALARM_LABELS: Readonly<Record<string, string>> = {
  temperature_warning: '체온 알람',
  rumination_warning: '반추 알람',
  activity_warning: '활동 알람',
  drinking_warning: '음수 알람',
  feeding_warning: '사양 알람',
  health_warning: '건강 경고',
  estrus: '발정 알람',
  calving: '분만 알람',
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
