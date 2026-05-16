# BUG-001 Audit — 수태율(CR) 계산 중복 사이트 전수 조사

> 2026-05-16. fertility-service 통합 작업의 근거 문서.
> 사용자 결정 사항(D1–D6, metrics-contract.md v0.2 §0.1)에 따라 단일 owner = `packages/server/src/services/metrics/fertility-service.ts`.

## Stop-Condition Check

| 항목 | 결과 |
|---|---|
| 발견된 농장-CR 사이트 수 | **10** (예상 10+, 범위 3–10 안에서 상한) |
| `/breeding`의 83.0% 재현 가능성 | ✅ 정식 site(`breeding.routes.ts:315`)가 이미 `pregnant ÷ decided`를 사용 → fertility-service가 동일 공식 → 동일 결과 |
| `pregnant ÷ decided` 외 분모 패턴 | ⚠️ **2 사이트 발견** — 자세한 사항 §3 |

stop-condition 어디에도 해당 안 함. 정상 진행.

## 1. In-scope 사이트 — fertility-service로 통합

모두 `pregnant ÷ (pregnant + open|not_pregnant)` 공식 (D2 정의).

| # | 파일:라인 | 함수/맥락 | 데이터 출처 | 슬라이싱 | 적용 헬퍼 |
|---|---|---|---|---|---|
| S1 | `breeding.routes.ts:315` | `GET /breeding/farm/:farmId` | `pregnancyChecks` table (최신 20행) | 단일 농장, count-based | `decisionsFromPregnancyChecks` + `computeCR` |
| S2 | `unified-dashboard.routes.ts:4285` | `computeBreedingKpis` | `pregnancyChecks` (PR #32에서 정정) | 농장 단위, 기간 옵션 | 동일 |
| S3 | `report.routes.ts:265` | `computeBreedingMetrics` (월간 보고서) | `breedingEvents` grouped by type (count) | 농장 단위, 월 | `decisionsFromBreedingEventCounts` + `computeCR` |
| S4 | `breeding-pipeline.service.ts:502` | `calcKpis` (번식 파이프라인 KPI) | `pregnancyChecks` (별도 쿼리) | 농장 단위, 365일 | `decisionsFromPregnancyChecks` + `computeCR` |
| S5 | `breeding-performance.service.ts:107` | `calcMonthKpis` | smaxtec events + 수동 `pregnancyChecks` 병합 | 농장×월 (6개월 추이) | 두 extractor 병합 |
| S6 | `breeding-performance.service.ts:214` | `getFarmComparison` | 동일 (smaxtec + manual) | 농장 비교 (limit 10) | 동일 |
| S7 | `breeding-performance.service.ts:340` | `getParityAnalysis` | 동일 | 산차 그룹 (5 buckets) | 동일 |
| S8 | `breeding-feedback.service.ts:60` | `getFarmSemenPerformance` (정액별, 2년) | SQL aggregate (`breeding_events JOIN pregnancy_checks`) | 농장×정액 | `computeCRFromCounts` |
| S9 | `breeding-feedback.service.ts:151` | `getConceptionStatsForTool` 농장 종합 | 동일 | 농장 종합 | 동일 |
| S10 | `breeding-feedback.service.ts:187` | `getConceptionStatsForTool` 정액별 상세 | 동일 | 농장×정액 (lim 20) | 동일 |

## 2. 데이터 소스 차이

세 사이트군은 같은 농장·같은 시점이라도 **분모 구성**이 다르므로 결과 값이 다를 수 있다 (의도된 차이). 이 PR의 목적은 **공식·코드 단일화**이며, 슬라이싱/소스 통합은 차후 PR의 일.

| 그룹 | 데이터 출처 | 결과 의미 |
|---|---|---|
| A. S1, S2, S4 | `pregnancyChecks` table만 | 수동 입력된 임신감정 결과만 반영 |
| B. S3 | `breedingEvents` (type별 count) | 수의사 진료 기록 기반 |
| C. S5, S6, S7 | smaxtec API `pregnancy_check` events + `pregnancyChecks` table 병합 | 센서 + 수동 모두 |
| D. S8, S9, S10 | SQL JOIN(`breeding_events`→`pregnancy_checks`, 120일 윈도우) | 수정-임신감정 페어링 |

→ 동일 농장에서 A·B·C·D 그룹이 다른 숫자를 보일 수 있는 것은 **데이터 소스 차이**이지 공식 차이가 아니다. 이 차이를 사용자에게 노출할지 여부는 metrics-contract.md §11에서 별도 결정 대상.

## 3. Out-of-Scope (다른 공식 — 명시적 제외)

이 PR에서 건드리지 **않는** CR 계산 사이트.

| # | 파일:라인 | 공식 | 사유 |
|---|---|---|---|
| X1 | `breeding-feedback.service.ts:225` | `pregnant ÷ inseminationCount` (raw 수정 횟수) | 의미가 다름 — "개체별 수정 성공률" (반복수정우 판단용). 농장 CR이 아님. **유지.** |
| X2 | `breeding-advisor.service.ts:675` | `pregnant ÷ decided` (공식은 같음) | 슬라이스가 다름 — "특정 종모우 × 특정 패턴" 학습 가산점. 농장 CR이 아님. **유지** (별도 PR에서 fertility-service 호출로 전환 가능). |

## 4. 동작 변화 예측 (Behavior Delta)

대부분 사이트는 공식이 이미 일치하므로 결과 값 무변화. 단, 다음 두 항목은 **의도된 수정**:

| Site | Before | After | Delta |
|---|---|---|---|
| S5/S6/S7 (`breeding-performance.service.ts`) | `manualPreg.push(p.result === 'pregnant')` 패턴 — **'pending', null, 'inconclusive' 등이 분모에 false로 포함되는 잠재 버그** (D2 위반) | `decisionsFromPregnancyChecks`가 'pending' 등을 분모에서 제외 (D2 준수) | **수태율 약간 상승 가능** — 분모가 작아지므로. 의도된 D2 수정. |
| 모든 사이트 | smaxtec 이벤트의 `details.pregnant`가 boolean 아니면 일관성 없게 처리됨 (사이트마다 다름) | `decisionsFromSmaxtecPregnancyEvents`가 `=== true` / `=== false` 외 모두 제외 | **무변화** 또는 미세한 상향 |
| **빈 농장 (D5)** | `0` (rate) | `null` (rate) → UI는 "—" 표시 | **출력 의미 변화**. 본 PR은 호출처에서 `?? 0` 폴백으로 backward-compat 보존. UI "—" 전환은 후속 PR. |
| **소수점 정밀도** | `unified-dashboard.routes.ts`만 1자리 (`ratioPct(..., 1)`), 나머지는 정수 | 모두 정수 (`Math.round(rate)`) | unified-dashboard만 0.X% 손실, 다른 사이트 무변화. UI는 `.toFixed(1)`로 "83.0" 표시하므로 외관상 무변화. |

## 5. 호출처 변경 후 정합성 가드

각 site 변경 후, 다음을 한 사이클 내에서 확인한다:
1. 이전 코드의 `Math.round((p/d)*100)` 결과 == 신규 `computeCR().rate` (정수 % 같음)
2. `pregnantCount`, `openCount` 등 downstream 변수는 fertility-service 결과로부터 재구성하여 보존
3. 타입 변경 없음 (`conceptionRate: number` 그대로)

## 6. PR 범위 확인

- 변경 파일 예상: 7개 (10 sites가 5개 파일에 분포)
- 신규 파일: `fertility-service.ts`, `fertility-service.test.ts`
- 건드리지 않음:
  - `/breeding` 액션 카드 UI (web)
  - `/epidemiology/dashboard` (방역 대시보드)
  - 수의사 AI 추천 텍스트 (`vet-action-plans.ts`, AI prompts)
  - `pregnancyRate` 공식 (별도 의존, 이미 PR #32에서 클램프 적용)
  - `breeding-advisor`의 학습 가산점 로직
  - D4 % → 0.00 표기 변환 (BUG-005 별도)

## 7. 검증 계획

타입체크 외에 자동 회귀 검증:
- pure 함수 unit test (`fertility-service.test.ts`):
  - 빈 입력 → rate=null
  - 5+5 (50%) → rate=50
  - 83+17 (83%) — `/breeding`의 83.0% 재현
  - 100+0 (100%) → rate=100
  - extractor가 'pending' 등 비결정 결과를 분모에서 제외
- 통합 회귀:
  - 변경 전후 grep으로 호출 사이트 다이프
  - PR #32 + 본 PR 적용 후 동일 농장·동일 기간 `/dashboard`, `/breeding`, `/breeding/calendar`, `/farm/:id`, `/reports/monthly`가 같은 CR을 표시하는지 시연 환경에서 수동 검증 (지표 5개 화면)
