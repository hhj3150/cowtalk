// 지역/테넌트 분석용 프롬프트 빌더

import type { RegionalProfile, Role } from '@cowtalk/shared';
import { ROLE_CONTEXT } from './system-prompt.js';

export function buildRegionalPrompt(
  profile: RegionalProfile,
  role: Role,
): string {
  const sections: string[] = [];

  // 1. 지역 개요
  sections.push(`## 지역/테넌트 개요
- 요약: ${profile.summary}
- 총 농장 수: ${String(profile.farms.length)}개
- 총 두수: ${String(profile.totalAnimals)}두
- 활성 알림: ${String(profile.activeAlerts)}건`);

  // 2. 농장별 현황
  if (profile.farms.length > 0) {
    const farmLines = [...profile.farms]
      .sort((a, b) => b.activeAlerts - a.activeAlerts)
      .slice(0, 20)
      .map((f) =>
        `- ${f.name}: ${String(f.totalAnimals)}두, 알림 ${String(f.activeAlerts)}건${f.healthScore !== null ? `, 건강점수 ${String(f.healthScore)}` : ''}`,
      );
    sections.push(`## 농장별 현황 (알림순)
${farmLines.join('\n')}`);
  }

  // 3. 클러스터 신호
  if (profile.clusterSignals.length > 0) {
    const clusterLines = profile.clusterSignals.map((c) =>
      `- [${c.severity}] ${c.signalType}: ${c.description} — 영향 농장: ${c.affectedFarms.join(', ')}`,
    );
    sections.push(`## 클러스터 감지 신호
${clusterLines.join('\n')}`);
  }

  const roleCtx = ROLE_CONTEXT[role] ?? '일반 관점';

  return `${sections.join('\n\n')}

---

## 요청
이 지역/테넌트의 전체 현황을 분석하여 다음 JSON 형식으로 응답하세요.
역할: ${roleCtx}

\`\`\`json
{
  "summary": "지역 전체 요약",
  "cluster_analysis": [
    {
      "signal_type": "신호 유형",
      "affected_farms": ["농장명"],
      "interpretation": "해석",
      "severity": "low|medium|high|critical",
      "recommendation": "권고"
    }
  ],
  "farm_rankings": [
    {
      "farm_id": "id",
      "farm_name": "이름",
      "urgency_score": 0-100,
      "main_issue": "주요 이슈"
    }
  ],
  "risks": ["지역 수준 위험"],
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
