# BUG-005 Audit — AI confidence 단위 통일 (D4)

> 2026-05-17. Phase 1 마지막 BUG. 코드베이스에 `confidence` 필드가 **0-1 float** 과 **0-100 integer** 두 단위로 공존하던 D4 위반을 단일화. canonical = 도메인 0-1, UI 에서 ×100 1회 변환.

## 0. 핵심 문제

| 생태계 | 단위 (전환 전) | 증거 |
|---|---|---|
| smaXtec / pipeline / AI interpreter / LiveAlarm | **0-1 float** (canonical) | `normalization.ts:136` clamp[0,1], `validation.ts` "must be 0-1", DB `smaxtecEvents.confidence` |
| **SovereignAlarm rules** | **0-100 integer** (위반) | `types.ts:18 // 0-100%`, rule 8파일 `Math.round(60 + ...)` |

→ 같은 이름 `confidence` 가 도메인에서 단위 충돌. SovereignAlarm rules 가 D4 위반자 (CASE D).

---

## 1. CASE 분류 결과

| CASE | 정의 | 사이트 | 처리 |
|---|---|---|---|
| A | 도메인 0-100 + UI ×100 (중복) | 0건 | — |
| B | UI raw float 표시 | 0건 | — |
| C | 하드코딩/샘플 % 카피 | FusionPanel(orphan), KakaoAlimtalk(샘플) | FusionPanel 제거 / Kakao 주석 |
| **D** | 도메인 필드 0-100 정수 | SovereignAlarm rules 8파일 + orchestrator + prediction-bridge | **0-1 전환** |
| E | UI render ×100 1회 | EstrusAnimalList / ClusterDetail / EventLabelModal / ExtractedRecord / AiPerformance | 유지 (정당) |
| F | confidence 무관 실측 비율 | 발열률 / 센서장착률 / 수태율 등 | 유지 |
| G | rule 임계값 % | "발열 5%+", InbreedingGauge 눈금 | 유지 |

---

## 2. CASE D 전환 (SovereignAlarm 0-100 → 0-1)

### 2-1. 단일 변환 함수 신설

**파일**: `packages/server/src/services/sovereign-alarm/confidence.ts` (신규)

```ts
toConfidence01(score100: number): number   // 0-100 점수 → 0-1 (clamp 내장, NaN→0)
clampConfidence01(value: number): number   // 이미 0-1 인 값 보정 후 [0,1] clamp
```

rule 내부 점수식(`60 + (tempAvg-39.5)*40` 등)은 그대로 두고, **출력 `confidence:` 프로퍼티만** `toConfidence01(...)` 1회 통과 — 단일 변환 지점.

### 2-2. rule 8파일 25 site 전환

| 파일 | confidence site | 처리 |
|---|---|---|
| `temperature.rules.ts` | 3 | `toConfidence01(Math.round(...))` |
| `feeding.rules.ts` | 2 | 〃 |
| `composite.rules.ts` | 2 | 〃 |
| `estrus.rules.ts` | 2 (출력) | 〃 (local `const confidence` 0-100 유지 — severity 비교용) |
| `rumination.rules.ts` | 2 | 〃 |
| `activity.rules.ts` | 3 | 〃 |
| `calving.rules.ts` | 3 (출력) | 〃 (literal `30` 도 `toConfidence01(30)`) |
| `disease-risk.rules.ts` | 10 | 〃 |

→ **출력 25 site 전부 `toConfidence01()` 경유.** `types.ts:18` 주석 `// 0-100%` → `// 0-1 float (canonical)`.

### 2-3. orchestrator.ts confidence 보정 로직

전환 전: `Math.round(newConf * learned)` — multiplier 곱셈 후 `Math.round` → 0-1 값 파괴. `Math.max(1, Math.min(100, ...))` → 0-1 값이 1로 강제.

전환 후: multiplier 는 비율이므로 `Math.round` 없이 곱셈만, 최종 `clampConfidence01()` 로 [0,1] clamp.

### 2-4. prediction-bridge.service.ts (predictions 테이블)

전환 전: sovereign `probability: alarm.confidence / 100` (0-100 가정), `rankScore: .../100`. `alarm.confidence` 가 0-1 이 되면 0-0.01 로 깨짐.

전환 후:
- sovereign: `probability/confidence/rankScore` 모두 `alarm.confidence` (0-1) 직접.
- breeding: `confidence: 85` → `0.85` (predictions.confidence 0-1 통일).
- diff_diagnosis: `confidence: candidate.probability` → `candidate.probability / 100` (candidate.probability 는 diff 내부 0-100 → 경계에서 ÷100).

→ `predictions.confidence` 컬럼이 **0-1 로 통일** (AiPerformancePage `averageConfidence * 100` 기대값과 일치). DB schema 변경 없음 (`real` 타입).

### 2-5. UI consumer

- `SovereignAlarmFeed.tsx:149` — `{alarm.confidence}%` → `{Math.round(alarm.confidence * 100)}%` (×100 1회).
- `unified-dashboard.api.ts` `SovereignAlarm.confidence` — JSDoc `0-1 float` 명시.
- `CowProfilePage` `estrusIntensity()` — **이미 0-1 임계값**(`>= 0.7` / `>= 0.4`) 사용 중 → 본 전환으로 SovereignAlarm 입력과 정합. 코드 변경 없음 (전환이 기존 버그를 수정).

---

## 3. CASE C 결론

| 사이트 | 결론 | 처리 |
|---|---|---|
| `FusionPanel.tsx` | 사용처 grep 0건 — **orphan** | ✅ 파일 삭제 |
| `KakaoAlimtalkSettings.tsx:45` `confidence: '87'` | `SAMPLE_VARIABLES` = 템플릿 미리보기 전용 샘플 (production 미흐름) | ✅ 주석 명시 ("미리보기 전용") |
| `kakao-alimtalk.ts notifyDiseaseSuspected` | 알림톡 API 경계값 (request body param, 도메인 confidence 미연동) | ✅ JSDoc 단위 명시 (0-100 percent, API 경계) |

---

## 4. 회귀 방지 (3단계)

### 4-1. audit 스크립트
`scripts/audit-confidence-units.mjs` + `npm run audit:confidence-units`:
- SovereignAlarm rule 의 모든 출력 `confidence:` 가 `toConfidence01()` / `clampConfidence01()` 경유 또는 0-1 리터럴인지 검사.
- 0-100 정수 재등장 시 exit 1.

### 4-2. 단위 테스트 (14 tests 신규)
- `confidence.test.ts` (12) — `toConfidence01` / `clampConfidence01` 변환·clamp·NaN 가드.
- `rules-confidence.test.ts` (2) — 5개 시나리오 × 전체 룰 → 모든 alarm.confidence ∈ [0,1] 어설션.

### 4-3. 단위 명시 방식 — JSDoc + audit 스크립트 채택 (brand 타입 미채택)

박스가 제시한 `Confidence01` / `Pct100` brand 타입은 **미채택**. 근거:
- brand 타입은 DB(Drizzle `number`) / JSON parse 경계마다 `as Confidence01` 캐스트 강제 → 코드베이스 전역 대규모 churn + 위험.
- audit 스크립트(4-1) + 테스트(4-2) 가 동등한 회귀 방어를 surgical diff 로 제공.
- 향후 ESLint custom rule 은 Phase 2 후보.

---

## 5. 보존 (변경 없음 — 재확인)

- BUG-001 수태율 단일 소스 / BUG-006 D5 라벨 / BUG-007 두수·알림 단일 소스 / BUG-008 ai-performance-service
- CASE E 5사이트 (`× 100` 1회 — 이미 0-1 입력) / CASE F 실측 비율 / CASE G rule 임계값
- master 권한 / 다크모드 / 수의사 AI 추천 텍스트
- v4-engines confidence (이미 0-1, prompt text 내 `× 100` 은 CASE E)

---

## 6. 검증

### Tests
- 신규 14 tests (`confidence.test.ts` 12 + `rules-confidence.test.ts` 2)
- 기존 회귀 0: metrics(67) + alerts(30) → 합계 **111 tests passed**

### tsc
- packages/shared, server, web → EXIT=0 ✅

### audit
- `npm run audit:confidence-units` → 통과 (SovereignAlarm 룰 출력 전부 0-1) ✅

---

## 7. 검증 가능 시점

- **Backend** (rule/orchestrator/prediction-bridge): Railway 머지 후 production — SovereignAlarm 생성 시 confidence 0-1.
- **Frontend** (SovereignAlarmFeed ×100, FusionPanel 삭제, Kakao 주석): Netlify deploy preview 즉시.
- 혼합 PR → preview 에서 SovereignAlarmFeed confidence % 표시 우선 확인, 머지 후 풀 검증.

---

## 8. Phase 2 (본 PR 비포함)

- DifferentialDiagnosis `candidate.probability` 자체 0-100 — diff-diagnosis 서비스 전체 audit 후 0-1 전환.
- `notifyDiseaseSuspected` 알림톡 경계 — 도메인 confidence 연동 시 0-1 입력 + sender ×100 으로 정리.
- ESLint custom rule (confidence 단위 정적 검증) — audit 스크립트 보완.
- legacy `predictions.confidence` 과거 데이터 (0-100 으로 저장된 행) — 마이그레이션 필요 시 별도 결정 (schema 변경 아님, 데이터 정합).
