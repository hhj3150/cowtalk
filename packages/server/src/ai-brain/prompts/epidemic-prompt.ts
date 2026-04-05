// 전염병 조기경보 프롬프트 빌더
// 클러스터 데이터 → Claude API → 전파 위험도 + 방역 권고

import type { Role } from '@cowtalk/shared';
import type { DetectedCluster } from '../../epidemic/cluster-detector.js';
import type { FarmProximityRisk } from '@cowtalk/shared';
import { ROLE_CONTEXT } from './system-prompt.js';

export function buildEpidemicPrompt(
  cluster: DetectedCluster,
  nearbyRiskFarms: readonly FarmProximityRisk[],
  role: Role,
): string {
  const sections: string[] = [];

  // 1. 클러스터 개요
  sections.push(`## 질병 클러스터 분석 요청

### 클러스터 개요
- 질병 유형: ${cluster.diseaseType}
- 경보 레벨: ${cluster.level}
- 영향 농장 수: ${String(cluster.farms.length)}개
- 총 건강 이벤트: ${String(cluster.totalEvents)}건
- 클러스터 반경: ${cluster.radiusKm.toFixed(1)}km
- 중심 좌표: (${cluster.center.lat.toFixed(4)}, ${cluster.center.lng.toFixed(4)})
- 최초 감지: ${cluster.firstEventAt.toISOString()}
- 최종 이벤트: ${cluster.lastEventAt.toISOString()}`);

  // 2. 확산 속도
  sections.push(`### 확산 분석
- 확산 속도: ${cluster.spreadRate.farmsPerDay.toFixed(2)} 농장/일
- 이벤트 발생률: ${cluster.spreadRate.eventsPerDay.toFixed(2)} 건/일
- 확산 추세: ${cluster.spreadRate.trend}`);

  // 3. 영향 농장 목록
  const farmLines = cluster.farms.map((f) =>
    `- ${f.farmName} (${f.farmId.slice(0, 8)}): 이벤트 ${String(f.eventCount)}건, 중심거리 ${f.distanceFromCenter.toFixed(1)}km, 최근 ${f.latestEventAt.toISOString()}`,
  );
  sections.push(`### 영향 농장 (${String(cluster.farms.length)}개)
${farmLines.join('\n')}`);

  // 4. 인근 위험 농장
  if (nearbyRiskFarms.length > 0) {
    const riskLines = nearbyRiskFarms.slice(0, 10).map((f) =>
      `- ${f.farmName}: ${f.distanceKm}km, 위험점수 ${String(f.riskScore)}/100, 요인: ${f.riskFactors.join(', ')}`,
    );
    sections.push(`### 인근 위험 농장 (${String(nearbyRiskFarms.length)}개)
${riskLines.join('\n')}`);
  }

  const roleCtx = ROLE_CONTEXT[role] ?? '일반 관점';

  // 5. 응답 형식
  sections.push(`---

## 요청
이 질병 클러스터를 분석하여 전염병 위험도를 평가하고 방역 권고를 제시하세요.
역할: ${roleCtx}

중요: smaXtec 센서 이벤트는 95% 이상 정확도이므로 신뢰합니다.
클러스터 패턴에서 전염병 가능성, 확산 방향, 방역 조치를 판단하세요.

\`\`\`json
{
  "risk_assessment": "종합 위험 평가 (2-3문장)",
  "disease_identification": {
    "likely_disease": "추정 질병명 (한국어)",
    "confidence": 0.0-1.0,
    "basis": ["근거1", "근거2"]
  },
  "spread_prediction": {
    "direction": "확산 방향 (예: 북동쪽)",
    "speed": "slow|moderate|fast",
    "at_risk_farms": ["위험 농장ID"]
  },
  "quarantine_actions": [
    {
      "action": "isolate|vaccinate|monitor|restrict_movement|test|cull",
      "target_farms": ["농장ID"],
      "urgency": "critical|high|medium|low",
      "description": "구체적 방역 조치 설명"
    }
  ],
  "actions": {
    "farmer": "농장주 즉각 조치 사항",
    "veterinarian": "수의사 긴급 대응 지침",
    "quarantine_officer": "방역관 방역 조치 지침",
    "government_admin": "행정관 보고/조정 사항"
  },
  "severity": "low|medium|high|critical",
  "data_references": ["근거 데이터"]
}
\`\`\``);

  return sections.join('\n\n');
}
