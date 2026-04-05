// 농장 분석용 프롬프트 빌더

import type { FarmProfile, Role } from '@cowtalk/shared';
import { ROLE_CONTEXT } from './system-prompt.js';

export function buildFarmPrompt(
  profile: FarmProfile,
  role: Role,
): string {
  const sections: string[] = [];

  // 1. 농장 기본 정보
  sections.push(`## 농장 정보
- 농장명: ${profile.name}
- 주소: ${profile.address}
- 지역: ${profile.region}
- 총 두수: ${String(profile.totalAnimals)}두
- 젖소: ${String(profile.breedComposition.dairy)}두, 한우/비육우: ${String(profile.breedComposition.beef)}두`);

  // 2. 활성 smaXtec 이벤트
  if (profile.activeSmaxtecEvents.length > 0) {
    const eventSummary = summarizeEvents(profile.activeSmaxtecEvents);
    sections.push(`## 농장 활성 이벤트 (${String(profile.activeSmaxtecEvents.length)}건, 신뢰)
${eventSummary}`);
  } else {
    sections.push('## 농장 활성 이벤트\n없음');
  }

  // 3. 개체별 요약 (상위 20두)
  const highlights = profile.animalProfiles.slice(0, 20).map((a) => {
    const eventTypes = a.activeEvents.map((e) => e.type).join(', ') || '없음';
    const temp = a.latestSensor.temperature !== null ? `${String(a.latestSensor.temperature)}°C` : '-';
    return `- ${a.earTag} (${a.breedType === 'dairy' ? '젖소' : '한우'}, ${String(a.parity)}산): 체온 ${temp}, 이벤트: ${eventTypes}`;
  });

  if (highlights.length > 0) {
    sections.push(`## 개체 현황 (상위 ${String(highlights.length)}두)
${highlights.join('\n')}`);
  }

  // 4. 건강 점수
  if (profile.farmHealthScore !== null) {
    sections.push(`## 농장 건강 점수: ${String(profile.farmHealthScore)}/100`);
  }

  const roleCtx = ROLE_CONTEXT[role] ?? '일반 관점';

  return `${sections.join('\n\n')}

---

## 요청
이 농장의 전체 현황을 분석하여 다음 JSON 형식으로 응답하세요.
역할: ${roleCtx}

\`\`\`json
{
  "summary": "농장 전체 요약 한 문장",
  "health_score": 0-100 또는 null,
  "today_priorities": [
    {
      "priority": 1,
      "action": "오늘 할 일",
      "target": "대상 (귀표번호 등)",
      "urgency": "low|medium|high|critical",
      "reasoning": "이유"
    }
  ],
  "animal_highlights": [
    {
      "animal_id": "id",
      "ear_tag": "귀표",
      "issue": "이슈 설명",
      "severity": "low|medium|high|critical",
      "suggested_action": "권고 행동"
    }
  ],
  "risks": ["농장 수준 위험 요소"],
  "actions": {
    "farmer": "농장주 조언",
    "veterinarian": "수의사 조언",
    "government_admin": "행정관 조언",
    "quarantine_officer": "방역관 조언"
  },
  "severity": "low|medium|high|critical",
  "data_references": ["근거 데이터"]
}
\`\`\``;
}

function summarizeEvents(
  events: readonly { type: string; severity: string; animalId: string; detectedAt: Date }[],
): string {
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const e of events) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1;
  }

  const typeLines = Object.entries(byType).map(([t, c]) => `  - ${t}: ${String(c)}건`);
  const sevLines = Object.entries(bySeverity).map(([s, c]) => `  - ${s}: ${String(c)}건`);

  return `유형별:\n${typeLines.join('\n')}\n심각도별:\n${sevLines.join('\n')}`;
}
