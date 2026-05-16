# BUG-008 Audit — 가짜 AI 정확도 제거 + clampPct 일관 적용 (D4/D5)

> 2026-05-16. AI 성과 지표 (accuracy/precision/recall/F1) 가 ground truth 부족 상태에서 "0.0%" / hardcoded mock 수치로 표시되던 패턴 차단. 표본 임계값(minSamples=10) 미달 시 `status='data_insufficient'` + `displayValue='—'` 일관 적용.

## 0. 핵심 문제

| 상황 | Before | After |
|---|---|---|
| 빈 label 테이블 (totalLabels=0) | "AI 정확도 0.0%" 빨간 게이지 | "—" + neutral 색 + "표본 0건 / 최소 10건 필요" |
| ground truth < 10건 | "AI 정확도 60.0% (3/5)" | "—" (data_insufficient) |
| 시연용 hardcoded mock | "AI 감지 정확도 95%+" / "AI 정확도 94.2%" | "—" + "학습 중" suffix |
| precision/recall/F1 = 0 | "0%" with bright color | "—" + neutral |

---

## 1. Audit grep 결과

### A. AI 성능 user-visible site (서버 0 폴백)

| # | 파일:라인 | 패턴 | 분류 | 처리 |
|---|---|---|---|---|
| 1 | `label-chat.routes.ts:335` | `accuracyRate = totalLabels > 0 ? ... : 0` | **D5 violation** | ✅ → `computeAccuracy()` + `accuracyResult` |
| 2 | `label-chat.routes.ts:369-375` | `recentAccuracy/prevAccuracy = ... : 0` | **D5 violation** | ✅ → `computeChange()` + `improvementResult` |
| 3 | `unified-dashboard.routes.ts:3060` | `accuracyRate = ... : 0` | **D5 violation** | ✅ → `accuracyResult` 추가 |
| 4 | `quarantine-dashboard.routes.ts:282-284` | precision/recall/f1 = 0 when no data | **D5 violation** | ✅ → `precisionResult/recallResult/f1Result` |
| 5 | `sovereign-alarm/label.service.ts:56` | `accuracy = total > 0 ? ... : 0` | **D5 violation** | ✅ → `accuracyResult` 추가 |
| 6 | `feedback.repo.ts:99` | `precision: total > 0 ? ... : 0` | (no FE consumer) | ⬜ 유지 (server-only, 노출 시점에 wrap) |

### B. UI 측 D5 violation (서버 데이터 0을 그대로 표시)

| # | 파일:라인 | 라벨 | 분류 | 처리 |
|---|---|---|---|---|
| 1 | `SovereignAiWidget.tsx` AccuracyGauge | `rate.toFixed(1)%` + 컬러 게이지 | **D5 violation** | ✅ → `status='data_insufficient'` 분기, "—" + neutral |
| 2 | `TinkerbellAssistant.tsx:500` | `accuracyRate.toFixed(1)%` AI 컨텍스트 주입 | **D5 violation** | ✅ → `accuracyResult.status` 분기 |
| 3 | `CaseDatabase.tsx:111-122` | `(precision*100).toFixed(0)%` 컬러 라벨 | **D5 violation** | ✅ → `AccuracyMetric` 컴포넌트 (D5 강제) |
| 4 | `AiPerformancePage.tsx:25` ProgressBar | `Math.min(value*100, 100)` (음수 미가드) | clampPct gap | ✅ → `Math.max(0, Math.min(...))` 추가 |
| 5 | `AiPerformancePage.tsx:123` hasMinData=10 | 이미 D5 패턴 | ⬜ 유지 (이미 컴플라이언트) |
| 6 | `VitalMonitorChart.tsx:154` | "학습 중" + "레이블 축적 필요" | ⬜ 유지 (이미 컴플라이언트) |

### C. Hardcoded mock 수치 (시연용도 X)

| # | 파일:라인 | mock | 처리 |
|---|---|---|---|
| 1 | `DemoModePage.tsx:24` | `AI 감지 정확도: 95, suffix: '%+'` | ✅ → `value: null` + "학습 중" |
| 2 | `DemoModePage.tsx:37` | `건강 점수: 92, suffix: '점'` | ✅ → `value: null` + "AI 분석" |
| 3 | `DemoModePage.tsx:63` | `정상 비율: 97.3, suffix: '%'` | ✅ → `value: null` + "실시간" |
| 4 | `DemoModePage.tsx:74` | `AI 정확도: 94.2, suffix: '%'` | ✅ → `value: null` + "학습 중" |
| 5 | `xai.routes.ts:122-124` | "estrusDetection: '95%+'" 등 transparency 문서 텍스트 | ⬜ 유지 (frontend 미연동, transparency 보고서용) |

→ **수정 18건 (server 5 + UI 5 + mock 4 + service+test 2 + docs 2)**, 보존 4건 (이미 D5 컴플라이언트 or 정당한 컨텍스트).

### D. clampPct 미적용 site

검토: 비율 계산식 grep 결과 80+ 사이트 중 financial/cost 비율 (revenue/cost percentage)은 분모≥분자 보장되므로 안전. user-visible 사이트는 모두 `clampPct` 또는 `Math.min/max` 가드 적용됨. ProgressBar 1건 (음수 미가드) 추가 보완.

---

## 2. ai-performance-service 도입

**파일**: `packages/server/src/services/metrics/ai-performance-service.ts`

```typescript
export interface AccuracyResult {
  readonly numerator: number;       // k
  readonly denominator: number;     // n
  readonly rate: number | null;     // 0-100 정수, null=insufficient
  readonly displayValue: string;    // "85.0%" or "—"
  readonly status: 'ok' | 'data_insufficient';
}

export const DEFAULT_MIN_SAMPLES = 10;

// 분자/분모 직접 계산
computeAccuracy(numerator, denominator, opts?): AccuracyResult

// 0-1 fraction (precision/recall/F1) + 별도 sampleSize
computeAccuracyFromFraction(fraction, sampleSize, opts?): AccuracyResult

// 정확도 변화율 (improvementRate)
computeChange(current, previous): ChangeResult

// data_insufficient sentinel
accuracyInsufficient(sampleSize?): AccuracyResult
```

**보장**
1. `denominator < minSamples` → status='data_insufficient', displayValue='—', rate=null
2. `denominator ≥ minSamples` → status='ok', clampPct 적용된 0-100 rate
3. `numerator > denominator` (시스템 버그) → numerator를 denominator로 clamp
4. NaN/Infinity/음수 → data_insufficient
5. fractionDigits 옵션 (0=정수, 1=소수1)

**unit test** (`ai-performance-service.test.ts`): **22 tests**
- minSamples 가드 (n=5 → insufficient, n=10 → ok, custom minSamples)
- 분자 > 분모 clamp
- NaN/Infinity/음수 입력
- fraction (0-1) clamp
- computeChange: 둘 중 하나 insufficient → 결과 insufficient
- accuracyInsufficient sentinel
- D5 violation 방지 (긍정 라벨 미포함)

---

## 3. 교체 결과 (8 user-visible 사이트)

### Site 1 — label-chat.routes.ts sovereign-stats

**Before**: `accuracyRate: 0` when totalLabels=0
**After**:
```typescript
const accuracyResult = computeAccuracy(confirmedCount, totalLabels);
// + recent/prev 30일 정확도
const improvementResult = computeChange(recentAccuracyResult, prevAccuracyResult);
// SovereignAiStats: accuracyResult, improvementResult 추가 (기존 accuracyRate/improvementRate는 @deprecated 유지)
```

### Site 2 — unified-dashboard.routes.ts event-label-stats

`accuracyResult` 추가, deprecated `accuracyRate` 유지.

### Site 3 — quarantine-dashboard.routes.ts cases (precision/recall/F1)

**Before**: `precision/recall/f1 = 0` when labeledCount=0, 컬러 라벨 표시
**After**:
- 분모(labeledCount)는 `tp + fp` (pending 제외)
- `precisionResult / recallResult / f1Result` (모두 `AccuracyResult`)
- `labeledCount < 10` → 모두 `data_insufficient`

### Site 4 — sovereign-alarm label.service.ts

`accuracyResult` 추가 (fractionDigits=0, 정수 %).

### Site 5 — SovereignAiWidget.tsx AccuracyGauge

**Before**: `rate.toFixed(1)%` 항상 표시, 색은 rate≥85=녹/70=노/<70=빨
**After**:
- `accuracy.status === 'data_insufficient'` → "—" + neutral 색 + "표본 N건 / 최소 10건 필요"
- 충분 시 컬러 게이지 + "k/n 정확" 분자/분모 동반 표기

### Site 6 — TinkerbellAssistant.tsx formatSovereignContext

AI 시스템 프롬프트에 "정확도: 0.0%" 잘못된 정보 주입 차단:
```typescript
accLine = stats.accuracyResult.status === 'data_insufficient'
  ? `정확도: — (표본 ${denominator}건, 최소 10건 필요)`
  : `정확도: ${displayValue} (${numerator}/${denominator}, 30일 변화: ${improvementResult.displayValue})`
```

### Site 7 — CaseDatabase.tsx

신규 `AccuracyMetric` 컴포넌트 — `status='data_insufficient'` 시 "—" + neutral, ok 시 컬러 라벨.
`allInsufficient` 시 "충분한 표본이 없습니다 (최소 10건 필요, 현재 N건)" 안내.

### Site 8 — DemoModePage.tsx 4 hardcoded mock

`value: number | null` 타입 확장. `null` → "—" + neutral + suffix. 4개 mock 제거:
- "AI 감지 정확도 95%+" → "—" + "학습 중"
- "건강 점수 92점" → "—" + "AI 분석"
- "정상 비율 97.3%" → "—" + "실시간"
- "AI 정확도 94.2%" → "—" + "학습 중"

### Site 9 (보너스) — AiPerformancePage.tsx ProgressBar 음수 가드

`Math.min(value * 100, 100)` → `Math.max(0, Math.min(safeValue * 100, 100))` + NaN 가드.

---

## 4. 정당한 보존 (수정하지 않음)

| 사이트 | 이유 |
|---|---|
| `feedback.repo.ts:99` precision: 0 | 서버 내부 함수, 현재 FE 호출 없음. 노출 시점에 wrap 예정 |
| `xai.routes.ts:122-124` "95%+" 등 | transparency 보고서 정적 텍스트, FE 미연동 |
| `VitalMonitorChart.tsx:154` "학습 중" | 이미 D5 컴플라이언트 |
| `AiPerformancePage.tsx hasMinData=10` | 이미 D5 컴플라이언트 |
| `v4-engines/*` confidence × 100 | BUG-005 D4 (0-1 float 표시) 작업 범위 |
| `claude-interpreter.ts AI 텍스트 정확도` | BUG-005 prompt sweep 작업 범위 |

---

## 5. Backwards Compatibility

**기존 필드 유지 (deprecated)**
- `SovereignAiStats.accuracyRate: number` (기존 0-100, FE 점진 마이그)
- `SovereignAiStats.improvementRate: number`
- `EventLabelStats.accuracyRate: number`
- `AccuracyStats.precision/recall/f1: number` (0-1 fraction)
- `SovereignAlarmAccuracy.accuracy: number`

**신규 필드 (canonical)**
- `accuracyResult: AccuracyMetricResult`
- `improvementResult: AccuracyChangeResult`
- `precisionResult / recallResult / f1Result: AccuracyMetricResult`

FE 신규 코드는 `*Result` 필드만 사용. 다음 메이저에서 legacy 제거 예정.

---

## 6. 검증

### Tests
- `ai-performance-service.test.ts` **22 tests passed**
- 기존 metrics + alerts (fertility, herd, alert-aggregator) **75 tests passed** (회귀 없음)
- 합계 **97 tests passed**

### tsc
- packages/shared, server, web → EXIT=0 ✅

### Grep verification
```
grep -rEn "value: 9[0-9]\.[0-9]+, suffix.*%|hardcoded.*accuracy" src/ packages/
```
→ user-visible hardcoded mock 0건 ✅ (legitimate enum/static text 제외)

---

## 7. 검증 가능 시점

본 BUG-008은 **frontend + backend 혼합 PR**:
- Frontend (Netlify deploy preview 즉시): SovereignAiWidget, CaseDatabase, TinkerbellAssistant, DemoModePage, AiPerformancePage 변경 → 미리 표시 검증 가능
- Backend (Railway 머지 후): label-chat / unified-dashboard / quarantine-dashboard / sovereign-alarm 응답에 `*Result` 필드 추가 → preview에서는 legacy 필드로 동작, production deploy 후 신규 필드 반영

→ **PR description 상단에 "frontend = preview 즉시 / backend Result 필드 = post-merge" 명시**.

검증 방법:
1. /dashboard 진입 → SovereignAiWidget AccuracyGauge → 표본 부족 시 "—" + neutral (mock 75 안 보임)
2. /epidemiology/cases 진입 → AI 정확도 지표 표본 부족 시 "—" (precision/recall/F1 모두 "—")
3. /demo 페이지 자동순환 → 95%/92/97.3%/94.2% 안 보임, "—" + "학습 중" 표시
4. 팅커벨 시스템 프롬프트 → "정확도: —" or "정확도: 85.0% (45/53, 30일 변화: +5.0%)" 형태
5. /intelligence/ai-performance → 표본 < 10 시 기존 경고 메시지 유지
6. 모든 user-visible % 위젯 0–100 범위 (음수/100+ 0건)

---

## 8. Phase 2 (다음 sweep, 본 PR 비포함)

- `feedback.repo.ts getEnginePerformance` — 노출 시점에 AccuracyResult wrap
- `unified-dashboard.routes.ts` 전국 발열률 / sensor rate 등 — service 통합 시 AccuracyResult 패턴 일관 적용
- `v4-engines/*.ts` confidence × 100 + claude-interpreter — BUG-005 (D4 0-1 float 통일)
- `intelligence-loop/model-evaluator.ts` precision/recall — 사용 시점에 AccuracyResult wrap
- legacy 필드 (`accuracyRate` / `improvementRate` / `accuracy` / `precision` 0-1) 다음 메이저에서 제거
