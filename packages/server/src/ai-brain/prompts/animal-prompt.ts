// 개체 분석용 프롬프트 빌더
// AnimalProfile → 구조화된 프롬프트

import type { AnimalProfile, Role, V4AnalysisSummary } from '@cowtalk/shared';
import { ROLE_CONTEXT } from './system-prompt.js';

export function buildAnimalPrompt(
  profile: AnimalProfile,
  role: Role,
  v4Analysis: V4AnalysisSummary | null,
): string {
  const sections: string[] = [];

  // 1. 기본 정보
  sections.push(`## 개체 정보
- 귀표번호: ${profile.earTag}
- 이력번호: ${profile.traceId ?? '미등록'}
- 축종: ${profile.breedType === 'dairy' ? '젖소' : '한우/비육우'}
- 품종: ${profile.breed}
- 성별: ${profile.sex}
- 산차: ${String(profile.parity)}
- 생년월일: ${profile.birthDate ? profile.birthDate.toISOString().split('T')[0] : '미상'}
- 농장: ${profile.farmName} (${profile.region})`);

  // 2. 최신 센서 데이터
  const s = profile.latestSensor;
  sections.push(`## 최신 센서 데이터 (smaXtec 위내센서)
- 체온: ${formatValue(s.temperature, '°C')}
- 반추: ${formatValue(s.rumination, '분/일')}
- 활동: ${formatValue(s.activity, '단위')}
- 음수: ${formatValue(s.waterIntake, 'L/일')}
- pH: ${formatValue(s.ph)}
- 측정 시각: ${s.measuredAt ? s.measuredAt.toISOString() : '없음'}`);

  // 3. 활성 smaXtec 이벤트
  if (profile.activeEvents.length > 0) {
    const eventLines = profile.activeEvents.map((e) =>
      `- [${e.type}] 감지: ${e.detectedAt.toISOString()}, 신뢰도: ${String(Math.round(e.confidence * 100))}%, 심각도: ${e.severity}${e.stage ? `, 단계: ${e.stage}` : ''}`,
    );
    sections.push(`## 활성 smaXtec 이벤트 (신뢰 — 재판단 불필요)
${eventLines.join('\n')}`);
  } else {
    sections.push('## 활성 smaXtec 이벤트\n없음');
  }

  // 4. 24시간 센서 트렌드 (요약)
  if (profile.sensorHistory24h.length > 0) {
    const trend = summarizeSensorTrend(profile.sensorHistory24h);
    sections.push(`## 24시간 센서 트렌드
- 체온 범위: ${trend.tempRange}
- 반추 범위: ${trend.rumRange}
- 활동 범위: ${trend.actRange}
- 데이터 포인트: ${String(profile.sensorHistory24h.length)}개`);
  }

  // 5. 번식 이력
  if (profile.breedingHistory.length > 0) {
    const breedLines = profile.breedingHistory.slice(0, 5).map((b) =>
      `- ${b.date.toISOString().split('T')[0]}: ${b.semenType ?? '정액정보없음'} → ${b.result}`,
    );
    sections.push(`## 번식 이력 (최근 5건)
${breedLines.join('\n')}
- 임신 상태: ${profile.pregnancyStatus ?? '미확인'}
- 수정 후 경과일: ${profile.daysSinceInsemination !== null ? `${String(profile.daysSinceInsemination)}일` : '해당없음'}`);
  }

  // 6. 건강 이력
  if (profile.healthHistory.length > 0) {
    const healthLines = profile.healthHistory.slice(0, 5).map((h) =>
      `- ${h.date.toISOString().split('T')[0]}: ${h.diagnosis}${h.treatment ? ` → 치료: ${h.treatment}` : ''}`,
    );
    sections.push(`## 건강 이력 (최근 5건)
${healthLines.join('\n')}`);
  }

  // 7. 생산/성장 데이터
  if (profile.breedType === 'dairy' && profile.production) {
    const p = profile.production;
    sections.push(`## 유량 데이터
- 유량: ${formatValue(p.milkYield, 'kg')}
- 유지방: ${formatValue(p.fat, '%')}
- 유단백: ${formatValue(p.protein, '%')}
- 체세포수(SCC): ${formatValue(p.scc, '천/ml')}
- 검정일: ${p.testDate ? p.testDate.toISOString().split('T')[0] : '없음'}`);
  }

  if (profile.breedType === 'beef' && profile.growth) {
    const g = profile.growth;
    sections.push(`## 성장 데이터
- 체중: ${formatValue(g.weight, 'kg')}
- 일당증체(ADG): ${formatValue(g.dailyGain, 'kg/일')}
- 등급 예측: ${g.gradeEstimate ?? '없음'}
- 측정일: ${g.measureDate ? g.measureDate.toISOString().split('T')[0] : '없음'}`);
  }

  // 8. 환경 데이터
  if (profile.environment) {
    const env = profile.environment;
    sections.push(`## 환경
- 외기온: ${formatValue(env.tempOutside, '°C')}
- 습도: ${formatValue(env.humidity, '%')}
- THI: ${formatValue(env.thi)}`);
  }

  // 9. 지역 맥락
  if (profile.regionalContext) {
    const rc = profile.regionalContext;
    if (rc.nearbyDiseaseReports.length > 0) {
      const diseaseLines = rc.nearbyDiseaseReports.map((d) =>
        `- ${d.diseaseType}: ${d.location} (${d.distance !== null ? `${String(d.distance)}km` : '거리 미상'})`,
      );
      sections.push(`## 지역 방역 현황
${diseaseLines.join('\n')}`);
    }
  }

  // 10. v4 룰 엔진 보조 분석
  if (v4Analysis) {
    const v4Lines: string[] = [];
    if (v4Analysis.estrusScore !== null) {
      v4Lines.push(`- 발정 점수: ${String(Math.round(v4Analysis.estrusScore * 100))}%`);
    }
    if (v4Analysis.diseaseRisks.length > 0) {
      for (const dr of v4Analysis.diseaseRisks) {
        v4Lines.push(`- ${dr.diseaseType} 위험: ${String(Math.round(dr.score))}점 (${dr.matchingSymptoms.join(', ')})`);
      }
    }
    if (v4Analysis.pregnancyStability !== null) {
      v4Lines.push(`- 임신 안정성: ${String(Math.round(v4Analysis.pregnancyStability * 100))}%`);
    }
    v4Lines.push(`- 데이터 품질: ${String(v4Analysis.dataQualityScore)}점`);

    const featureEntries = Object.entries(v4Analysis.features);
    if (featureEntries.length > 0) {
      v4Lines.push('- 주요 특성:');
      for (const [key, val] of featureEntries) {
        v4Lines.push(`  - ${key}: ${String(Math.round(val * 100) / 100)}`);
      }
    }

    sections.push(`## 참고: v4 룰 엔진 보조 분석
${v4Lines.join('\n')}`);
  }

  // 역할 맥락
  const roleCtx = ROLE_CONTEXT[role] ?? '일반 관점';

  return `${sections.join('\n\n')}

---

## 요청
위 데이터를 분석하여 다음 JSON 형식으로 응답하세요.
역할: ${roleCtx}

\`\`\`json
{
  "summary": "한 문장 요약",
  "interpretation": {
    "primary": "주요 해석",
    "secondary": "보조 해석",
    "confidence": "high|medium|low",
    "reasoning": "판단 근거"
  },
  "risks": ["위험 요소 1", "위험 요소 2"],
  "actions": {
    "farmer": "농장주 조언",
    "veterinarian": "수의사 조언",
    "inseminator": "수정사 조언",
    "government_admin": "행정관 조언",
    "quarantine_officer": "방역관 조언",
    "feed_company": "사료회사 조언"
  },
  "severity": "low|medium|high|critical",
  "data_references": ["근거 데이터 1", "근거 데이터 2"]
}
\`\`\``;
}

function formatValue(val: number | null, unit?: string): string {
  if (val === null) return '데이터 없음';
  return unit ? `${String(val)}${unit}` : String(val);
}

interface TrendSummary {
  readonly tempRange: string;
  readonly rumRange: string;
  readonly actRange: string;
}

function summarizeSensorTrend(
  snapshots: readonly { temperature: number | null; rumination: number | null; activity: number | null }[],
): TrendSummary {
  const temps = snapshots.map((s) => s.temperature).filter((v): v is number => v !== null);
  const rums = snapshots.map((s) => s.rumination).filter((v): v is number => v !== null);
  const acts = snapshots.map((s) => s.activity).filter((v): v is number => v !== null);

  return {
    tempRange: temps.length > 0 ? `${String(Math.min(...temps))}~${String(Math.max(...temps))}°C` : '데이터 없음',
    rumRange: rums.length > 0 ? `${String(Math.min(...rums))}~${String(Math.max(...rums))}분/일` : '데이터 없음',
    actRange: acts.length > 0 ? `${String(Math.min(...acts))}~${String(Math.max(...acts))}` : '데이터 없음',
  };
}
