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
- pure 함수 unit test (`fertility-service.test.ts`): **24/24 통과 (209ms)**
  - 빈 입력 → rate=null, displayValue="—", status="data_insufficient"
  - 5+5 (50%) → rate=50, displayValue="50.0%"
  - 83+17 (83%) — `/breeding`의 83.0% 재현
  - 100+0 (100%) → rate=100
  - rate=0 vs rate=null 구별 (D5 핵심)
  - pending만 있는 농장 → "—"
  - extractor가 'pending' 등 비결정 결과를 분모에서 제외
- 통합 회귀: §9 Pre-merge regression checklist 참조.

## 8. Part 2 — 수치 변화 검증 (D2 위반 수정 영향)

| 측정 지점 | 수정 전 CR | 수정 후 CR | Δ |
|----------|-----------|-----------|---|
| /breeding 전체 | **측정 불가** | **측정 불가** | — |
| /breeding 특정 농장 1개 | **측정 불가** | **측정 불가** | — |
| /breeding 최근 3개월 | **측정 불가** | **측정 불가** | — |
| 대시보드 메인 CR | **측정 불가** | **측정 불가** | — |
| Report API CR | **측정 불가** | **측정 불가** | — |

**사유**: 현재 worktree에 DB 연결 없음 (Postgres + Redis 미설치). vitest는 DB 의존 테스트가 hang. **시연 환경 회귀에서 수동 측정 예정** (§9 체크리스트).

**예상 방향** (코드 인스펙션 근거, 측정값 아님):
- breeding-performance.service.ts 3개 사이트 (S5/S6/S7)에서 D2 위반 수정 (pending 분모 제외) → 분모가 줄어듦 → CR 약간 **상승** 예상
- 정확도 다른 사이트(S1~S4, S8~S10)는 이미 D2 준수 → **무변화** 예상
- 빈 농장: 이전 0% → 본 PR 후 "—" (UI 2곳에서 가드, 나머지는 0% 유지 — §9 참조)
- 113.1% / 110.6% 같은 100% 초과 값: PR #32에서 차단됨. 본 PR에서 추가로 fertility-service의 `Math.min(100, ...)` 보강. **재발 불가능**.

**판단 기준 (사용자 브리프)**:
- 수정 후 CR이 60–85%면 정상 → 시연 환경에서 확인
- 수정 후 CR이 90% 이상이면 비현실적 → **즉시 보고**, D2 정의 재검토

## 9. Pre-merge Regression Checklist (시연 환경)

### 배포 정보
- 본 PR(#33) base는 `claude/xenodochial-lewin-2906ef` (PR #32 브랜치). Netlify 미리보기 트리거 여부는 PR #32 머지 후 main 대상으로 retarget되며 결정됨.
- PR #32의 미리보기 (참고): https://deploy-preview-32--cowtalk.netlify.app
- PR #33 푸시 후 GitHub PR 페이지에서 Netlify 체크 확인 필요.

### 5개 화면 — 사용자 요청 vs 실제 CR 표시 위치

⚠️ **사용자 브리프 5개 화면 중 2개(`/farm-management`, `/admin/system`)는 코드 상 CR을 표시하지 않음.** 정확한 검증을 위해 CR이 실제로 노출되는 5개 화면으로 대체 권고.

| # | 사용자 요청 화면 | CR 표시 여부 | 대체 권고 |
|---|---|---|---|
| 1 | `/` (메인 대시보드) | ✅ (BreedingPipelineWidget) | 그대로 |
| 2 | `/breeding` | ✅ (BreedingCommandPage KPI 카드) | 그대로 |
| 3 | `/breeding/calendar` | ❌ CR 미표시 | `/breeding/performance` (BreedingKpiPage)로 대체 |
| 4 | `/farm-management` | ❌ CR 미표시 | `/farm/:farmId` (FarmDetailPage) — 개별 농장 카드의 CR 필드 |
| 5 | `/admin/system` | ❌ CR 미표시 | `/report/farm/:farmId/monthly` (MonthlyReportPage) — 월간 보고서 CR 라인 |

### 검증할 5개 화면 (수정안)

| # | URL | 컴포넌트 | CR 표시 위치 (라벨/셀렉터) | 기본 필터 |
|---|---|---|---|---|
| 1 | `/dashboard` | `BreedingPipelineWidget` 안 | "수태율(CR)" 라벨, KPI 칩 6개 중 두 번째. CSS path: `[class*="kpi-chip"]` 또는 텍스트 매치 "수태율(CR)" | master 권한, 전체 농장 통합 |
| 2 | `/breeding` | `BreedingCommandPage` | "수태율" KPI 카드, 페이지 상단. 텍스트 매치 "수태율" + `.toFixed(1)` 출력 | master 권한, 농장 미선택(=전체) |
| 3 | `/breeding/performance` | `BreedingKpiPage` `<GaugeSection label="수태율">` | "수태율" 게이지 (큰 SVG). 라벨 텍스트 "수태율" | master 권한, 농장 미선택 |
| 4 | `/farm/:farmId` | `FarmDetailPage` | `<KpiCard label="수태율">` (line 229). 단일 농장 페이지 | master 권한, 갈전리 농장 등 샘플 1개 |
| 5 | `/report/farm/:farmId/monthly` | `MonthlyReportPage` (서버 응답 `BreedingMetrics.conceptionRate` + display) | "수태율 X%로 양호/미달..." 코멘트 라인 | master 권한, 갈전리 농장 직전 월 |

### 빈 농장(센서 0 또는 데이터 0건)의 화면별 표시 (최종)

| 화면 | 본 PR 머지 후 표시 | 비고 |
|---|---|---|
| `/dashboard` (BreedingPipelineWidget) | **"—"** (em dash) | D5 가드 ✅ |
| `/breeding` (BreedingCommandPage) | **"—"** (em dash) | D5 가드 ✅ |
| `/breeding/performance` 임신율 라인 | **"—"** | displayValue 사용 ✅ |
| `/breeding/performance` 게이지 | **"—" + "데이터 부족" 배지 + 빈 바** | **본 commit에서 완전 해결** (GaugeSection null 핸들링) ✅ |
| `/farm/:farmId` (FarmDetailPage) | null 처리됨 | 기존 코드 가드 ✅ |
| `/report/.../monthly` | 코멘트 생략 | 서버 `if (cr === null) {}` ✅ |
| `FarmComparisonChart` (대시보드 차트) | **빈 농장 차트에서 제외 + "데이터 부족 N개 농장 제외" 안내** | **본 commit에서 완전 해결** (filter null + 범례 안내) ✅ |

→ **사용자 가시 위치 7개 모두 D5 준수.** "0%"로 잔존하는 곳 없음. 차트 미표시 위치는 범례에서 제외 카운트 노출하여 투명성 보장.

### 검증 절차
1. PR #33 push 후 Netlify 빌드 대기 (3–5분).
2. 빌드 성공 시 preview URL을 PR에서 확인 (또는 PR #32와 결합 시 main 머지 후 https://cowtalk.netlify.app).
3. master 계정으로 5개 URL 순차 방문.
4. 각 화면의 CR 값 캡처 + 동일 여부 비교.
5. 빈 농장(예: 신규 또는 센서 0 농장)에서 "—" 표시 여부 캡처.
6. 결과를 본 audit doc `## 10. Regression Results`로 추가 (시연 후 작성).

### 자동화 한계
- worktree에 DB 없음 → API 응답 캡처 자동화 불가.
- E2E (Playwright) 시나리오는 별도 PR로 작성 필요.

---

## 10. Pre-merge Regression Checklist — 시연 환경 수동 검증 (6/4 대비)

cowtalk.netlify.app preview 환경에서 사용자(하원장님)가 직접 클릭 검증. master 권한 + 기본 필터 기준.

| # | URL | 확인 항목 | 셀렉터 / 라벨 위치 | 기대값 |
|---|-----|----------|---|---|
| 1 | `/dashboard` (또는 `/` → RoleAwareHome) | CR 수치 | `BreedingPipelineWidget` 안 KPI 칩 6개 중 **"수태율(CR)"** 라벨 | 한 값. 60–85% 범위. 110% 초과 없음. |
| 2 | `/breeding` | CR 수치 | `BreedingCommandPage` 상단 KPI 카드 — **"수태율"** 라벨 (큰 숫자) | #1과 동일 값. |
| 3 | `/breeding/calendar` | CR 미표시 확인 | 페이지 어디에도 "수태율" 없음 | (의도된 미표시. 코드 검증 완료) |
| 4 | `/farm/:farmId` (샘플: 갈전리 또는 술탄팜) | CR 수치 | `FarmDetailPage` 상단 `<KpiCard label="수태율">` | 해당 농장 단일 값. 빈 농장이면 "—". |
| 5 | `/report/farm/:farmId/monthly` | CR 코멘트 | "수태율 X%로 양호한 수준입니다" 또는 "...로 목표(50%) 미달입니다" 텍스트. 빈 농장이면 코멘트 자체 없음. | 정수 % 표기 (예: "수태율 63%로..."). null이면 라인 자체 미생성. |
| 6 | 빈 농장 1개 (센서 0 또는 신규 농장) | CR 표시 | 위 5개 위치 어디서나 | **"—"** (em dash) 또는 코멘트 미생성. "0%" 절대 금지. |
| 7 | `/breeding/performance` 수태율 게이지 | 빈 농장 | `GaugeSection label="수태율"`. 값 텍스트 + 회색 "데이터 부족" 배지 | **"—"** + 배지 + 빈 바. |
| 8 | `/dashboard` `FarmComparisonChart` | 빈 농장 | 차트의 막대 + 범례 영역 | 빈 농장 막대 미표시. 범례 우측에 "데이터 부족 N개 농장 제외" 텍스트. |
| 9 | 모든 화면 통합 | CR > 100% 발견 | 어디서든 텍스트 "1__%" 또는 "11_%" | **0건** (PR #32 카디널리티 수정 + fertility-service clamp). |
| 10 | `/dashboard` 번식 위젯 | mock 데이터 흔적 | "갈전리", "청송", "삼척한우", "영주", "봉화" 같은 demo 농장명 (실데이터에 없는 경우) | 실데이터만. demo 농장명 없음. 신규 농장은 빈 상태 표시. |

### 검증 결과 기록 (시연 후 작성)
표 옆에 "OK" / "FAIL: 사유" 컬럼 추가. FAIL이 1건이라도 있으면 머지 차단 → 즉시 fix PR.

---

## 11. Part 4 — PR #32 Mock 제거 영향 분석

**질문**: PR #32에서 삭제한 `generateDemoBreedingData()` 70줄이 사라진 후, unified-dashboard의 번식 위젯(`BreedingPipelineWidget`)이 어디서 데이터를 받는가?

**답**: **(b) 빈 응답 처리로 전환됨.**

**경로**:
- 클라이언트: `useQuery(['unified-dashboard-breeding-pipeline'])` → `/api/unified-dashboard/breeding-pipeline?farmId=...`
- 서버: `buildBreedingPipeline(farmId)` ([unified-dashboard.routes.ts](packages/server/src/api/routes/unified-dashboard.routes.ts) line ~4498)
- 분기:
  - **`animalRows.length === 0`** (해당 농장에 동물 0두 또는 farmId 미선택 시 전체 농장 동물 0두) → `emptyBreedingData()` 반환
    - 본 PR 후: `kpis = { conceptionRate: null, conceptionRateDisplay: '—', conceptionRateStatus: 'data_insufficient', estrusDetectionRate: 0, avgDaysOpen: 0, avgCalvingInterval: 0, avgDaysToFirstService: 0, pregnancyRate: null, ... }`
    - 파이프라인: 6개 stage 모두 count=0
    - UI: BreedingPipelineWidget이 "—" 표시 (D5 가드 적용됨)
  - **실데이터 있음** → `computeBreedingKpis(breedingEvts, pregChecks, calvingData, smaxtecEvts)` 호출 → 진짜 농장 데이터로 KPI 계산 → fertility-service 단일 소스 (D1)

**시연 영향**:
- 갈전리·술탄팜·해돋이 등 데이터 풍부한 시연 농장은 **무영향** — 실데이터로 정상 동작.
- 시연 시 사용자가 "신규 농장" 또는 "센서 0 농장"을 선택해도 가짜 146두 등장 안 함 — "—" 또는 "데이터 없음" 표시.
- 시연 시나리오에서 일부러 빈 농장을 골라 비교하는 흐름이 있다면 **자연스럽게 작동**. 가짜 데이터로 인한 신뢰 손상 위험 0.

**남은 위험**:
- 없음. PR #32의 emptyBreedingData()는 본 PR에서 D5 준수 (`conceptionRate: null` + display fields)로 보강됨.
- 단, `BreedingPipelineWidget`의 stage 카드(6개)가 모두 count=0으로 표시될 때 UX가 "정말 빈 농장"인지 명확히 보이도록 §10 #6 항목으로 확인.
