# CowTalk v5 Metrics Contract

> 단일 진실 공급원 (Single Source of Truth) — 사용자에게 표시되는 모든 숫자의 정의·공식·소유권.

| | |
|---|---|
| 버전 | **0.5** — §15.1 D5 UI Rendering 강제 (BUG-006: 긍정 라벨 제거 + MetricValue 컴포넌트) |
| 작성일 | 2026-05-16 |
| 최근 머지 | [#33 BUG-001](https://github.com/hhj3150/cowtalk/pull/33) (`6c2d886`) — 수태율 단일 소스 + D5 |
| 진행 중 | BUG-007 — 두수 단일 소스 (D7) + currentHeadCount 격하 (D8) + active 통일 (D9) + province 집계 (D14) |
| 소유자 | D2O CTO Office |
| 적용 범위 | 농장주·수의사·방역관·행정관 화면에 표시되는 모든 메트릭 |

---

## 0. Decision Log (v0.3)

| # | 항목 | 결정 | 결정일 | Owner |
|---|------|------|--------|-------|
| **D1** | 수태율(CR) 공식 단일 소스 | 신규 `packages/server/src/services/metrics/fertility-service.ts` 생성. 기존 `breeding-pipeline`·`unified-dashboard`·`report`·`breeding-performance`·`breeding-feedback`·`breeding.routes`의 인라인 CR 계산 → 이 모듈 호출로 일괄 교체. | 2026-05-16 | 하원장님 / Eng |
| **D2** | "결정난(decided)" 정의 | 임신확정 + 공태확정 only. **재검사 대기(pending)는 분모에서 제외.** 코드 표현: `pregnant ÷ (pregnant + open OR not_pregnant)`. smaXtec 이벤트는 `details.pregnant === true ∥ false`만 결정으로 인정. | 2026-05-16 | 하원장님 / Eng |
| **D3** | 알림 카운트 owner | 각 도메인 서비스(번식/건강/방역/우군)가 자체 알림 발행 → `packages/server/src/services/alerts/alert-aggregator.ts`(신설 예정)가 단일 집계·우선순위·중복제거·표시 카운트 산출. 라우트는 aggregator 1회 호출. | 2026-05-16 | (BUG-007 Part 2에서 구현, 다음 박스 대기) |
| **D4** | AI confidence 표시 단위 | **내부 0–1 float**, UI 표시도 0.00–1.00 (예: "신뢰도 0.87"). % 변환 금지. 기존 "61.9%" 류 표기 전수 제거. **본 PR 비포함, BUG-005에서 일괄 교체.** | 2026-05-16 | (BUG-005에서 구현) |
| **D5** | 빈 농장 KPI 표시 | "—" (em dash, U+2014). "0", "N/A", "데이터 없음(중복 라벨)" 금지. 라벨이 필요하면 "**데이터 부족**". "정상 운영" 라벨 금지. | 2026-05-16 | UI 가드는 본 PR + 호출처 |
| **D6** | 버그 수정 순서 | **BUG-001 → BUG-007 → BUG-006 → BUG-008 → BUG-005**. 한 PR = 한 버그. 평행 진행 금지. | 2026-05-16 | 하원장님 |
| **D7** | 두수(headCount) 단일 정의 | `COUNT(animals WHERE status='active' AND deletedAt IS NULL)` — 라이브. fertility-service 패턴 일관성. `currentHeadCount`는 agg 계산 비참여. | 2026-05-16 | 하원장님 |
| **D8** | `farms.currentHeadCount` 운명 | 표시 전용으로 격하. `getRegisteredHeadCount()` 명시적 호출만 허용. 사용자 노출 위젯에서 직접 SELECT 금지. 컬럼 자체는 등록 폼 입력값 보존 위해 유지. | 2026-05-16 | 하원장님 |
| **D9** | 두수 사용자 노출 | 라이브(D7)만 사용자 가시. registered(D8)는 행정 통계 전용. 같은 페이지에서 두 값 동시 노출 금지(11,376 vs 10,666 모순 해소). | 2026-05-16 | 하원장님 |
| **D11** | `HerdResult.source` 필드 | 유지. JSDoc: "live = 사용자 노출 / registered = 행정 전용". 정책 추적·디버깅용. | 2026-05-16 | 하원장님 |
| **D12** | `getRegisteredHeadCount` 함수명 | 채택. JSDoc에 "사용자 노출 위젯에서 호출 금지. 행정 통계 전용." 명시. | 2026-05-16 | 하원장님 |
| **D13** | 실측 0두 vs 측정 불가 분리 | 실측 0두(`count=0`) → `status='ok'`, `displayValue='0두'`. 측정 불가(farm 미존재 / NaN / 음수) → `herdUnavailable()` 반환, `status='data_insufficient'`, `displayValue='—'`. | 2026-05-16 | 하원장님 |
| **D14** | 시도별 두수 집계 | `getHerdByProvince()` 추가 (Map 반환, 9 시도 모두 포함). `getHerdInProvince(p)` 단일 조회. `national-situation.service.ts`에서 사용. province = 한국 행정구역 시/도 단위 (province-mapper `latLngToProvince`). | 2026-05-16 | Claude Code 권한 위임 |

### v0.2 → v0.3 본문 반영 사항 요약
- §6.1 수태율(CR): owner를 `fertility-service.ts`로 명시 + 함수 시그니처 명세 추가 + D2 "decided" 정의 명문화 (v0.2)
- §10.1 알림 카운트(activeAlerts): D3 단방향 흐름 명시 (v0.2)
- **§14** AI Confidence 표기 규칙 (D4) (v0.2)
- **§15** 빈 농장 / 데이터 부족 표시 규칙 (D5) (v0.2)
- **§16** L3 cluster detection thresholds — TBD placeholder (v0.2)
- 부록 A에 **Demo-Readiness** 컬럼 (✅ 핵심 / 🟡 보조 / ⬜ 비공개) (v0.2)
- **§8 우군 Herd**: §8.1 두수 owner를 `herd-service.ts`로 명시 (D7), §8.2 currentHeadCount 격하 (D8), §8.3 시도별 집계 (D14), §8.4–§8.6 비율·산차 유지, §8.7 source 필드 정책 (D11), §8.8 실측 0두 vs 측정 불가 (D13), §8.9 시도 9개 항상 포함 (D14) — **v0.3 신설**

### "61.9%" 류 표기 위치 (D4 후속 PR에서 제거 대상)
초기 grep 결과 (BUG-005 사전 자료):
- `packages/server/src/ai-brain/prompts/animal-prompt.ts:73` — `수태율: ${conceptionRate}%`
- `packages/server/src/ai-brain/prompts/conversation-prompt.ts:539, 754, 755, 756` — `${rate.toFixed(1)}%`
- `packages/web/src/pages/intelligence/BreedingCommandPage.tsx:77` — `kpis.conceptionRate.toFixed(1)`
- `packages/web/src/components/breeding/ParityAnalysisChart.tsx:121` — `수태 {g.conceptionRate}%`
- `packages/web/src/components/breeding/SemenRecommendation.tsx:64` — `수태율 {rec.pastConceptionRate}%`
- `packages/web/src/components/breeding/FarmComparisonChart.tsx:22` — `{ ..., unit: '%' }`
- `packages/web/src/components/breeding/BreedingTrendCharts.tsx:121` — `nationalAvg={NATIONAL.conceptionRate}` (55)
- `packages/web/src/components/farm/SimilarFarmRecommendation.tsx:46` — `{farm.conceptionRate}%`
- `packages/web/src/components/unified-dashboard/BreedingPipelineWidget.tsx` — 표시 % suffix
- (AI 정확도 "61.9%" 위치는 추가 grep 후 BUG-005에 별도 명세)

⚠️ **본 PR(BUG-001)은 이 목록을 건드리지 않는다.** 단, 발견된 위치를 BUG-005 작업의 단일 진실 공급원으로 등록.

---

## 1. About

CowTalk은 3계층 위계 데이터 플랫폼이다:

- **L1 농장주** — 본인 목장만, 데이터 원천
- **L2 수의사** — 담당 N개 목장 횡단 + 개별 진입
- **L3 방역관/행정관** — 지자체·광역·국가 단위 의사결정 (핵심 가치)

위로 갈수록 메트릭의 정확도가 기하급수적으로 중요해진다. L1에서 1마리 수태율이 1% 틀리는 것은 한 사람의 불편이지만, L3에서 100개 농장 합계의 수태율이 1% 틀리는 것은 정책 오판이다. 따라서 **모든 메트릭은 L1에서 L3까지 동일 정의로 일관성이 보장돼야 한다.**

이 문서는 그 일관성을 강제한다.

---

## 2. The Rules

1. **단일 owner**. 한 메트릭은 한 서비스에서만 계산한다. 다른 서비스는 호출만 한다. 동일 메트릭의 중복 구현은 즉시 제거 대상이다.
2. **계약 우선**. 이 문서가 코드보다 먼저다. 변경 시 PR에서 이 문서를 먼저 수정한 뒤 코드를 수정한다.
3. **범위 보장**. 모든 백분율은 `clampPct()`(0–100), 모든 count는 `clampNonNeg()`(≥0)를 거친다. DB CHECK 제약을 추가한다.
4. **mock 금지**. `Math.random()`, hardcoded fallback(`: 45`, `: 2.1`), 시연용 가짜 데이터는 production 경로에 절대 들어가지 않는다. 데이터 없으면 0 또는 null. 프론트엔드는 "데이터 없음"으로 표시한다.
5. **계층 일관성**. L1·L2·L3 화면이 같은 농장·같은 시점에 같은 숫자를 표시해야 한다. 다른 숫자면 버그다.
6. **검증 가능**. 메트릭마다 데이터 출처(테이블·필드 또는 API 엔드포인트)를 명시한다. 출처를 모르는 숫자는 표시하지 않는다.

---

## 3. Schema — 각 메트릭 entry는 다음 필드를 가진다

| 필드 | 의미 |
|---|---|
| **이름** | 한글명 / code name |
| **계층** | L1·L2·L3 중 표시되는 곳 (복수 가능) |
| **공식** | 실제 코드 또는 의사코드 |
| **단위** | %, 일, kg, ℃, ₩, count, score |
| **유효범위** | [min, max], 또는 sentinel(0=데이터 없음) 정의 |
| **출처** | DB table.column 또는 외부 API 엔드포인트 |
| **갱신 주기** | realtime / 5min / hourly / daily / on-event |
| **owner** | 계산 책임 서비스 (file:function) |
| **검증** | Reject(쓰기 차단) / Clamp(자동 보정) / Warn(로그만) |
| **표시 위치** | route + 컴포넌트 |
| **중복 구현** | 제거 대상 file:line 목록 |

---

## 4. Status — 동물 상태 정의 (강제 enum)

농장주가 같은 소를 "건유"라 부를 때와 시스템이 "건유"라 부를 때가 다르면 모든 KPI가 어긋난다. 동물 상태는 강제 enum이어야 한다.

| 상태 | 정의 | 자동 전이 조건 | 현재 구현 |
|---|---|---|---|
| `heifer` (육성우) | DIM 없음, parity = 0 | 분만 → `lactating` | ✅ |
| `lactating` (착유우) | 0 < DIM < 305, parity ≥ 1 | DIM ≥ 305 → `dry_off` | ⚠️ DIM 자동 전이 로직 부재 |
| `dry_off` (건유우) | 305 ≤ DIM < 400, 분만 예정일 -60~-30 | 분만 → `lactating` | ⚠️ 자동 전이 부재 |
| `cull_review` (도태 검토) | DIM ≥ 400 OR 4회+ 수정 실패 | 수동 결정 | ❌ 미구현 |
| `culled` (도태) | 수동 표시 | 종결 상태 | ✅ |
| `inactive` (비활성) | 일시 격리·이동 | 수동 | ✅ |

🔴 **현재 버그**: DIM 866일 소가 `dry_off`로 표시됨. `cull_review`로 자동 전이되는 로직이 없기 때문. **`profile-builder.ts`에 nightly 상태 재계산 잡 추가 필요.**

---

## 5. CRITICAL — 무결성 위반 현황

| ID | 메트릭 | 증상 | PR #32 상태 | 잔존 작업 |
|---|---|---|---|---|
| BUG-001 | 수태율 | 113.1% 출력 (1:N 카디널리티 불일치) | ✅ unified-dashboard.routes.ts 수정 | 나머지 10+ 중복 구현 통합 (이 contract 기반) |
| BUG-002 | 수태율 fallback | `: 45` (mock) | ✅ report.routes.ts 제거 | — |
| BUG-003 | healthScore | 음수 가능 | ✅ clampPct 적용 | 동일 패턴 다른 위치 sweep |
| BUG-004 | tempStability | 음수 가능 | ✅ clampPct 적용 | — |
| BUG-005 | demo 데이터 | `Math.random()` 기반 가짜 KPI | ✅ generateDemoBreedingData 삭제 | admin.routes.ts·lactation.routes.ts·epidemic.routes.ts 잔존 Math.random 검토 |
| BUG-006 | 동물 상태 | DIM 866일 = 건유 | ❌ 미수정 | 자동 전이 잡 구현 |
| BUG-007 | 알림 카운터 | "오늘 1건" vs "AI 19건" | ❌ 미수정 | 단일 쿼리로 통합 |
| BUG-008 | unhandledRate | 음수 가능 추정 | ❌ 미확인 | 위치 확정 + clamp |

---

## 6. 번식 Reproduction

### 6.1 수태율 / `conceptionRate`
- **계층**: L1, L2, L3 (전국 평균)
- **공식 (D2)**: `pregnant ÷ decided`, where `decided = (pregnant OR open OR not_pregnant)`. **pending 제외** — 재검사 대기는 분모에서도 빠진다.
- **단위**: % (소수 1자리). 단, fertility-service의 `rate` 필드는 0–100 정수. 빈 농장은 `null` (D5).
- **유효범위**: `[0, 100]` 또는 `null`. **never >100** (계약 강제).
- **출처 (여러 그룹)**:
  - A. `pregnancyChecks.result` (수동 감정만)
  - B. smaXtec `pregnancy_check` events `details.pregnant === true ∥ false`
  - C. `breedingEvents.type` 집계 (`pregnancy_confirmed` vs `pregnancy_failed`/`not_pregnant`/`open`)
  - D. SQL JOIN(`breeding_events`→`pregnancy_checks`, 120일 윈도우) — feedback 서비스
- **갱신**: on-event (임신감정 입력 시) + nightly 재집계
- **owner (D1)**: `packages/server/src/services/metrics/fertility-service.ts`
- **함수 시그니처**:
  ```typescript
  export interface Decision { readonly pregnant: boolean; }
  export interface CRResult {
    readonly numerator: number;     // 임신확정 두수
    readonly denominator: number;   // 임신확정 + 공태확정
    readonly rate: number | null;   // 0–100 정수, null = 빈 농장 (D5)
  }
  export function computeCR(decisions: ReadonlyArray<Decision>): CRResult;
  export function computeCRFromCounts(pregnant: number, decided: number): CRResult;
  export function decisionsFromPregnancyChecks(rows: ReadonlyArray<{ result: string }>): readonly Decision[];
  export function decisionsFromSmaxtecPregnancyEvents(events: ReadonlyArray<{ eventType: string; details: unknown }>): readonly Decision[];
  export function decisionsFromBreedingEventCounts(rows: ReadonlyArray<{ type: string; cnt: number }>): readonly Decision[];
  ```
- **검증**: Clamp (denominator>0 가드 + 정수 반올림). 음수·>100·NaN 발생 불가능.
- **표시**: `/dashboard`, `/breeding`, `/breeding/calendar`, `/farm/:id`, `/reports/monthly`. 모두 동일 값 (D1 일관성).
- **호출처 (전수)** — v0.2 시점 10 사이트, 본 PR에서 모두 fertility-service 호출로 전환. 전수 표는 `docs/bug-001-audit.md` §1 참조.
- **제외 사이트 (다른 메트릭)**:
  - `breeding-feedback.service.ts:225` — 개체별 raw 수정성공률 (`pregnant ÷ insem_count`), 반복수정우 판단용. 농장 CR 아님.
  - `breeding-advisor.service.ts:675` — 종모우×패턴별 학습 가산점용. 공식은 같으나 슬라이스가 다름. 향후 별도 PR.

### 5.2 발정탐지율 / `estrusDetectionRate`
- **계층**: L1, L2, L3
- **공식**: `inseminations ÷ expectedEstrus`, where `expectedEstrus = max(1, totalFemales × 0.6)` (한 사이클 21일 기준)
- **단위**: % (소수 1자리)
- **유효범위**: [0, 100]
- **출처**: smaXtec `estrus`/`heat`/`estrus_dnb` events + `breedingEvents.insemination`
- **갱신**: hourly (smaXtec 이벤트 도착 시)
- **owner**: `breeding-pipeline.service.ts:calcKpis`
- **검증**: Clamp
- **표시**: `/dashboard`, `/breeding`
- **중복 구현**: 동일 (CR과 같은 사이트들)

### 5.3 임신율 / `pregnancyRate` (PR)
- **계층**: L1, L2, L3
- **공식**: `estrusDetectionRate × conceptionRate ÷ 100` (업계 표준)
- **단위**: % (소수 1자리)
- **유효범위**: [0, 100]
- **출처**: 위 두 메트릭의 합성
- **갱신**: 위와 동일
- **owner**: `breeding-pipeline.service.ts:calcKpis`
- **검증**: Clamp (두 인자가 클램프돼 있으면 결과도 자동 보장)
- **표시**: `/breeding/kpi`

### 5.4 평균공태일 / `avgDaysOpen`
- **계층**: L1, L2
- **공식**: `mean(daysInStage)` for animals in `open` stage. 또는 `mean(firstInsemDate - calvingDate)` for confirmed cycles.
- **단위**: 일
- **유효범위**: [0, 730]. 730 초과는 `cull_review` 후보로 분리.
- **출처**: `calvingEvents.calvingDate` + `breedingEvents.eventDate` (type=insemination)
- **갱신**: daily
- **owner**: `breeding-pipeline.service.ts:calcKpis`
- **검증**: Clamp
- **표시**: `/breeding/kpi`, `/reports/monthly`
- **현재 잔존 mock**: `breeding-performance.service.ts`(월별 추이)는 0 반환 (Math.random 제거 완료, 정밀 계산 TODO)

### 5.5 분만간격 / `avgCalvingInterval`
- **계층**: L1, L2, L3
- **공식**: `mean(calving[i+1] - calving[i])` per animal, then mean across animals
- **단위**: 일
- **유효범위**: [250, 600]. 목표 365.
- **출처**: `calvingEvents.calvingDate` (deduplicated)
- **갱신**: daily
- **owner**: `breeding-pipeline.service.ts:calcKpis`
- **검증**: Warn (범위 밖이면 데이터 이상 로그)
- **표시**: `/breeding/kpi`

### 5.6 첫수정일수 / `avgDaysToFirstService`
- **계층**: L1, L2
- **공식**: `mean(firstInsemAfterCalving - calvingDate)`, filter ≤365일 (다음 사이클 제외)
- **단위**: 일
- **유효범위**: [30, 365]. 목표 <80.
- **출처**: `calvingEvents` + `breedingEvents`
- **갱신**: daily
- **owner**: `breeding-pipeline.service.ts:calcKpis`
- **검증**: Clamp (365 cap)
- **표시**: `/breeding/kpi`

### 5.7 산차 / `parity`
- **계층**: L1, L2
- **공식**: `animals.parity` (integer, 0=미경산)
- **단위**: count
- **유효범위**: [0, 10]
- **출처**: `animals.parity` (smaXtec sync or manual)
- **갱신**: on-event (분만 시 +1)
- **owner**: smaXtec sync pipeline
- **검증**: Reject (>10 또는 음수 입력 거부)
- **표시**: 모든 개체 카드

### 5.8 DIM / `daysInMilk`
- **계층**: L1, L2
- **공식**: `floor((now - lastCalvingDate) / 86400000)`
- **단위**: 일
- **유효범위**: [0, 305]. 305 초과는 자동 상태 전이(§4 참조).
- **출처**: `animals.lastCalvingDate` 또는 latest `calvingEvents.calvingDate`
- **갱신**: realtime (계산형)
- **owner**: `profile-builder.ts`
- **검증**: Warn (>305 시 dry_off로 전이 안 되면 데이터 무결성 알림)
- **표시**: 모든 개체 카드, `/breeding`
- 🔴 **BUG-006 (§5)**: 자동 전이 잡 부재 → 866일 소가 여전히 lactating으로 표시되는 상황 발생.

---

## 7. 건강 Health

### 6.1 healthScore (농장 건강 지수)
- **계층**: L2, L3 (농장 비교용)
- **공식**: `((totalActive - alertedAnimals) ÷ totalActive) × 100`, clamp [0, 100]
- **단위**: score (0–100)
- **유효범위**: [0, 100]
- **출처**: `animals.status='active'` + `smaxtecEvents` (지난 7일, distinct animal_id)
- **갱신**: hourly
- **owner**: `unified-dashboard.routes.ts:/farm-comparison`
- **검증**: Clamp ✅ (PR #32에서 적용)
- **표시**: `/dashboard/farm-comparison`

### 6.2 tempStability (체온 안정도)
- **계층**: L2, L3
- **공식**: `((totalActive - tempWarnedAnimals) ÷ totalActive) × 100`, clamp
- **단위**: score (0–100)
- **유효범위**: [0, 100]
- **출처**: smaXtec `temperature_warning` events (지난 7일)
- **갱신**: hourly
- **owner**: `unified-dashboard.routes.ts:/farm-comparison`
- **검증**: Clamp ✅
- **표시**: 동일

### 6.3 sensorRate (센서 장착률)
- **계층**: L1, L2, L3
- **공식**: `(distinct(animal_id with smaxtecEvent) ÷ totalActive) × 100`
- **단위**: %
- **유효범위**: [0, 100]
- **출처**: `smaxtecEvents` + `animals`
- **갱신**: daily
- **owner**: `unified-dashboard.routes.ts`
- **검증**: Clamp ✅ (`Math.min(100, ...)` 이미 적용)
- **표시**: `/dashboard/farm-comparison`

### 6.4 체온 / `temp`
- **계층**: L1, L2
- **공식**: smaXtec 위내센서 raw value. 알람 이벤트의 details.value에서 추출.
- **단위**: ℃
- **유효범위**: [35.0, 42.5]. 정상 [38.0, 39.0].
- **출처**: smaXtec API `temperature` metric
- **갱신**: 5분
- **owner**: `pipeline/sensor-pipeline.ts:collectSensorBatch`
- **검증**: Reject (범위 밖 raw 값은 쓰지 않음)
- **표시**: `/cow/:id` 차트

### 6.5 활동량 / `activity`
- **계층**: L1, L2
- **공식**: smaXtec activity metric (% activity 또는 raw count)
- **단위**: 🟡 **명확화 필요** — smaXtec API 응답 단위 확인 후 normalize
- **유효범위**: [0, ∞)? — 단위 확정 후 결정
- **출처**: smaXtec API `activity` metric
- **갱신**: 5분
- **owner**: `pipeline/sensor-pipeline.ts`
- **검증**: 단위 확정 후
- **표시**: `/cow/:id` 차트
- 🟡 **TODO**: 단위·정상범위 smaXtec 문서로 확정 후 이 항목 갱신

### 6.6 반추시간 / `rumination`
- **계층**: L1, L2
- **공식**: smaXtec rumination (분/일)
- **단위**: 분/일
- **유효범위**: [200, 600]. 정상 400–500.
- **출처**: smaXtec API (직접 노출 안 됨 — chewing 패턴에서 파생, 또는 events.details에 포함)
- **갱신**: hourly
- **owner**: `pipeline/sensor-pipeline.ts`
- **검증**: Warn (200 미만 시 health alert)
- **표시**: `/cow/:id`

### 6.7 회복률 / `recoveryRate`
- **계층**: L2
- **공식**: `treatments where outcome='recovered' ÷ totalCompletedTreatments`
- **단위**: %
- **유효범위**: [0, 100]
- **출처**: `treatment_records.outcome`
- **갱신**: on-event
- **owner**: `services/vet/treatment-outcome.service.ts`
- **검증**: Clamp
- **표시**: 수의사 모듈

---

## 8. 우군 Herd

### 8.1 두수 / `headCount` / `HerdResult.total`
- **계층**: L1, L2, L3
- **공식 (D7)**: `COUNT(animals where status='active' AND deletedAt IS NULL)` — 라이브.
- **단위**: count (`HerdResult.total: number`) + 표시 `displayValue: string` ("10,666두" 로케일).
- **유효범위**: [0, 5000].
- **출처**: `animals` 테이블 (라이브).
- **갱신**: realtime.
- **owner (D1·D7)**: `packages/server/src/services/metrics/herd-service.ts`.
  - 함수: `getHerdTotal({farmIds?})`, `getHerdPerFarm(farmId)`, `computeHerd(count, source?)`.
- **검증**: NaN/Infinity/음수 → `herdUnavailable()` (D13 측정 불가). 0 이상 정수 → 'ok'.
- **표시**: 모든 화면 상단. 11,376 (currentHeadCount) vs 10,666 (라이브) 모순 해소 (BUG-007).
- ✅ **BUG-007 해소**: 12 사이트 + 1 mock 통합 (audit §9 참조).

### 8.2 등록 두수 / `currentHeadCount` (D8 격하)
- **계층**: L3 행정 전용 (사용자 노출 금지, D9).
- **공식**: `farms.currentHeadCount` (수동 유지 등록값).
- **단위**: count.
- **owner**: `herd-service.ts: getRegisteredHeadCount({farmId?, farmIds?})`.
- **호출 제한**: 사용자 KPI 위젯 사용 금지. 행정 리포트·등록 폼 미리보기 등 명시적 컨텍스트 전용.
- **참고**: 컬럼 자체는 유지 (등록 시 입력값 보존). agg 계산 비참여.

### 8.3 시도별 두수 / `getHerdByProvince` (D14)
- **계층**: L3.
- **공식**: 9 시도 그룹화 (`latLngToProvince`로 farm 좌표 → 시도 매핑), per 시도 활성 동물 카운트.
- **단위**: `Map<province, HerdResult>` — 9 시도 모두 포함 (0두 시도는 "0두" 실측, D13).
- **출처**: `animals` JOIN `farms.lat/lng` + `province-mapper.latLngToProvince`.
- **owner**: `herd-service.ts: getHerdByProvince()`, `getHerdInProvince(province)`, `aggregateHerdByProvince(rows)` (pure).
- **표시**: 전국 방역 대시보드, `/regional-map`, `NationalSituation`.
- **국가/시도 합계 일관성**: 시도별 두수 합 = 전국 두수 (단일 라이브 소스이므로 수학적 일치 보장).

### 8.4 착유우 비율 / `lactatingRatio`
- **계층**: L1, L2.
- **공식**: `count(status='lactating') ÷ headCount × 100`.
- **단위**: %.
- **유효범위**: [0, 100].
- **출처**: `animals.status`.
- **갱신**: hourly.
- **owner**: `farm-service.ts` (검토 후 herd-service로 통합 가능).
- **검증**: Clamp.

### 8.5 건유우 비율 / `dryRatio`
- **계층**: L1, L2.
- 동일 구조, `status='dry_off'`.

### 8.6 평균산차 / `avgParity`
- **계층**: L1, L2, L3.
- **공식**: `mean(parity)`.
- **단위**: count.
- **유효범위**: [0, 5].
- **출처**: `animals.parity`.
- **갱신**: daily.

### 8.7 두수 source 정책 (D11)
`HerdResult.source` 필드:
- `'live'` (D9 기본): 사용자 노출 UI 허용. 모든 사용자 가시 위젯에서 사용.
- `'registered'`: 사용자 노출 금지. `getRegisteredHeadCount()` 호출 시에만 반환됨. 행정 통계 전용.

### 8.8 실측 0두 vs 측정 불가 (D13)
- **실측 0두** (`status: 'ok'`, `displayValue: '0두'`): DB 쿼리 성공 + count=0. "이 농장 동물 없음" 정확 표시.
- **측정 불가** (`status: 'data_insufficient'`, `displayValue: '—'`): farm 미존재 / NaN / 음수 / Infinity. UI "데이터 부족" 분기.
- 경계 케이스: pending-only 농장 등은 audit §11에서 별도 검토.

### 8.9 시도 집계 — 9 시도 항상 포함 (D14)
- `getHerdByProvince()` 결과 Map은 항상 9 시도 키 보존 (0두 시도도 'ok' "0두").
- '해외' / '미분류' 좌표는 집계에서 제외 (Map 키로 없음).
- 단일 시도 lookup: `getHerdInProvince(province)` → 알 수 없는 시도 → `herdUnavailable()`.

---

## 9. 경제 Economic

⚠️ 전체 도메인이 미완성. DHI 커넥터 미구현 상태. 시연용으로 표시되는 숫자가 있다면 모두 mock 의심 → 별도 sweep 필요.

### 8.1 유량 / `milkYield`
- **계층**: L1, L2, L3
- **공식**: DHI 검정 결과 직접값 또는 일간 측정값
- **단위**: kg/일 또는 kg/유기
- **유효범위**: [0, 60]
- **출처**: 🔴 **DHI 커넥터 미구현**. 임시 manual 입력만.
- **갱신**: 월간 (DHI 검정 주기)
- **owner**: 🟡 결정 필요 — `dhi-connector.ts`(미구현) → `economics.routes.ts`
- **검증**: Reject (범위 밖)
- **표시**: `/economics` (현재 미구현)

### 8.2 유지방 / `fatPercent`, 8.3 유단백 / `proteinPercent`, 8.4 SCC
- 동일 — DHI 의존, 미구현

### 8.5 등급 / `carcassGrade`, 8.6 경락가 / `auctionPrice`
- **계층**: L3 (시세는 전국)
- **출처**: 축산물등급판정 API (15058822), 축산물경락가격정보 API (15057912)
- **owner**: `services/connectors/grade-connector.ts` ✅ 구현됨
- **검증**: 외부 API 신뢰
- **표시**: `/economics/auction`

---

## 10. 알림/AI

### 10.1 활성 알림 수 / `activeAlerts` / `AlertCountResult`
- **계층**: L1, L2, L3
- **공식 (D3)**: `COUNT(smaxtecEvents WHERE detectedAt >= now-24h AND acknowledged=false)`.
- **opts 기본값** (`AlertOpts`):
  - `window: '24h'` (24h / 7d / 30d / live)
  - `ackedFilter: false` — **미확인만** (878 vs 874 모순 해소 핵심)
  - `severity: 'all'` (all / critical / high / medium / low)
  - `domainFilter: 'all'` (all / breeding / health / epidemic / herd)
- **단위**: `AlertCountResult { count: number, displayValue: string, status: 'ok'|'data_insufficient' }`
- **유효범위**: [0, ∞). 0건도 `'ok'` + `'0'` (D13 실측 0).
- **출처**: `smaxtecEvents` (도메인 서비스가 publish한 raw 이벤트).
- **갱신**: realtime.
- **owner (D3)**: `packages/server/src/services/alerts/alert-aggregator.ts` ✅ **BUG-007 Part 2에서 구현됨**.
- **함수 시그니처**:
  ```typescript
  // Pure
  export function buildAlertCountResult(rawCount: number): AlertCountResult;
  export function aggregateAlertRowsByProvince(rows): Map<string, AlertCountResult>;

  // DB wrappers
  export async function getActiveAlerts(opts?: AlertOpts): Promise<AlertCountResult>;
  export async function aggregateAlertsByDomain(opts?): Promise<Record<AlertDomain, AlertCountResult>>;
  export async function aggregateAlertsByFarm(opts?): Promise<ReadonlyMap<string, number>>;
  export async function aggregateAlertsByProvince(opts?): Promise<ReadonlyMap<string, AlertCountResult>>;
  export async function getAlertCountForWidget(widgetId: string, override?): Promise<AlertCountResult>;
  ```
- **위젯 preset (일관성 강제)**:
  - `main_24h_alerts` = 메인 KPI "24h 알림" (878)
  - `main_health_issues` = 메인 KPI "건강 이상" (health 도메인)
  - `main_breeding_alerts` = 메인 KPI "번식 알림" (breeding 도메인)
  - `main_epidemic_alerts` = 메인 KPI "방역 알림" (epidemic 도메인)
  - **`ai_briefing_24h` = `main_24h_alerts`와 동일 opts** → 878 vs 874 통일 (D3 핵심)
  - `regional_marker_24h` = /regional-map 마커
  - `epidemiology_dashboard` = 방역 대시보드
  - `epidemic_critical` = severity=critical
- **단방향 흐름 (D3)**:
  ```
  [번식 서비스]   [건강 서비스]   [방역 서비스]   [우군 서비스]
       │             │              │              │
       └─────────────┴──────────────┴──────────────┘
                          │ (각자 raw 알림 publish → smaxtecEvents)
                          ▼
            packages/server/src/services/alerts/
                    alert-aggregator.ts
              (collect + filter + group + 표시 카운트)
                          │
                          ▼
          [UI / route 1회 호출] → 모든 화면 동일 값
  ```
  **UI/route는 도메인 서비스를 직접 호출하지 않음.** aggregator만 경유.
- **호출처 (BUG-007 Part 2에서 교체)**:
  - ✅ `unified-dashboard.routes.ts:queryHerdOverview` — 메인 KPI 4개 (activeAlerts, healthIssues 등)
  - ✅ `unified-dashboard.routes.ts:buildAiBriefing` — `total24h` (AI 일일 브리핑) → 메인과 동일 widgetId
  - ✅ `regional.routes.ts:/map` — 마커 activeAlerts (clientside reduce 회귀 방지)
  - 🟡 잔존 사이트 (다음 sweep): `dashboard.routes.ts` healthEventCount, `profile-builder.ts` farmAlerts, `tool-executor.ts` alertsLast24h, `quarantine-dashboard.service.ts` fetchActiveAlerts (list 반환이라 별도 처리 필요).

  라우트는 aggregator를 **1회**만 호출한다. 자체적으로 카운트 재계산 금지.
- 🔴 **BUG-007**: 같은 화면에서 "오늘 1건" vs "AI 19건" 불일치 → aggregator 미구현이 원인. BUG-007 PR에서 해소.

### 9.2 미처리율 / `unhandledRate`
- **계층**: L2, L3
- **공식**: `(activeAlerts - ackedAlerts) ÷ activeAlerts × 100`
- **단위**: %
- **유효범위**: [0, 100]
- **출처**: 위와 동일
- **갱신**: realtime
- **owner**: 🟡 결정 필요
- **검증**: Clamp ❌ **미적용** (BUG-008)
- **표시**: 관리자 대시보드

### 9.3 AI 정확도 / `aiAccuracy`
- **계층**: L3 **only** (관리자 전용)
- **공식**: `confirmed_predictions ÷ total_predictions × 100`
- **단위**: %
- **유효범위**: [0, 100]
- **출처**: `label_feedback` 테이블
- **갱신**: weekly (재학습 후)
- **owner**: `services/sovereign-alarm/label.service.ts:56`
- **검증**: Clamp
- **표시**: `/admin/ai-performance` **only**
- 🔴 **현재 위반**: 농장주 화면에 "AI 정확도 61.9%" 노출됨. **관리자 전용으로 격리 필수.**

### 9.4 AI 신뢰도 / `confidence` (per alert)
- **계층**: L1, L2 (사용자에게 보임)
- **공식**: Claude API 응답에서 추출
- **단위**: % 또는 0–1
- **유효범위**: [0, 100]
- **출처**: `claude-interpreter.ts` 응답 파싱
- **갱신**: on-event
- **owner**: `ai-brain/claude-interpreter.ts`
- **검증**: 🟡 단위(% vs 0–1) 일관성 검증 필요
- **표시**: 알림 카드. **<70%는 UI 노출 안 함** (Issue #2 — 별도 PR)

---

## 11. 방역 Quarantine (L3 핵심)

L3 차별화 본진. 이 도메인의 메트릭들은 시연에서 가장 자주 클릭된다. 정확도가 곧 영업력.

### 10.1 위험농장 수 / `riskFarmCount`
- **계층**: L3
- **공식**: `count(farms where riskScore > threshold)`, top 5 sorted
- **단위**: count
- **유효범위**: [0, totalFarms]
- **출처**: 위험스코어 (§11.5)
- **갱신**: hourly
- **owner**: `services/epidemiology/quarantine-dashboard.service.ts`
- **검증**: —
- **표시**: 방역관 대시보드

### 10.2 의심사례 수 / `legalDiseaseSuspects`
- **계층**: L3
- **공식**: `count(investigations where priority='critical' AND status='active')`
- **단위**: count
- **유효범위**: [0, totalAnimals]
- **출처**: `investigations` 테이블
- **갱신**: realtime
- **owner**: `services/epidemiology/quarantine-dashboard.service.ts:429`

### 10.3 24h 추이 / `hourlyFever24h`
- **계층**: L3
- **공식**: 시간별 `count(smaxtecEvents where eventType IN ('temperature_high', 'health_103'))`
- **단위**: count/hour
- **유효범위**: [0, totalAnimals]
- **출처**: `smaxtecEvents`
- **갱신**: hourly
- **owner**: `services/epidemiology/quarantine-dashboard.service.ts`
- **검증**: —
- **표시**: 방역 대시보드 시계열

### 10.4 집단발생률 / `groupRate`
- **계층**: L3
- **공식**: `uniqueAffectedAnimals ÷ max(headCount, 1) × 100`
- **단위**: %
- **유효범위**: [0, 100]
- **출처**: 위와 동일 + `farms.currentHeadCount`
- **갱신**: hourly
- **owner**: `services/epidemiology/quarantine-dashboard.service.ts:447`
- **검증**: Clamp (현재 `Math.max(headCount, 1)`로 부분 가드)

### 10.5 위험스코어 / `riskScore`
- **계층**: L3
- **공식**: `100 - healthScore_composite`, where composite = tempScore(30) + rumScore(25) + actScore(20) + trendScore(10) + epiScore(10)
- **단위**: score (0–100)
- **유효범위**: [0, 100]
- **출처**: 위 5개 component score
- **갱신**: hourly
- **owner**: `services/epidemiology/quarantine-dashboard.service.ts:463`
- **검증**: Clamp (component score 각각도 cap 강제)
- **표시**: 방역 대시보드, 농장 비교
- 🟡 **잠재 위험**: 어떤 component가 cap 초과 시 total >100 → riskScore 음수. component별 Math.min cap 강제 확인 필요.

### 10.6 전국·시도별 집계 (national / province aggregates)
- **계층**: L3 **only**
- **공식**: 시도별 sum + 가중평균
- **단위**: 메트릭별 상이
- **유효범위**: 동일
- **출처**: `province-mapper.ts` (lat/lng → 9개 시도)
- **갱신**: hourly
- **owner**: `services/epidemiology/national-situation.service.ts`
- **검증**: ⚠️ **L1·L2·L3 일관성 검증 잡 필요**. 시도 합계 = 전국 합계 확인.
- **표시**: 전국 지도, 시도별 리스트
- 🔴 **현재 잔존 mock**: `national-situation.service.ts:212`의 `0.005 + Math.random() * 0.015` (주별 추이 가짜). **시연 전 제거 필수.**

---

## 12. Known Gaps (시연 전 반드시 해결)

D6 수정 순서: **BUG-001 → BUG-007 → BUG-006 → BUG-008 → BUG-005**.

1. **BUG-001 수태율 단일 owner** — fertility-service 도입 + 10 사이트 통합. **본 PR 진행 중**. Owner: 하원장님/Eng.
2. **BUG-007 알림 카운터 단일 쿼리** — `alert-aggregator.ts` 신설, "오늘 1건" vs "AI 19건" 해소. **Owner: TBD (다음 라운드에서 지정)**.
3. **BUG-006 DIM 자동 상태 전이 잡** — nightly `profile-builder` 잡으로 lactating→dry_off→cull_review 자동 전이.
4. **BUG-008 `unhandledRate` 위치 확정 + clamp** — 코드 위치 미확정.
5. **BUG-005 % 표기 일괄 교체** (D4 구현) — AI 정확도 농장주 화면 격리 포함. §0 Decision Log의 위치 목록 기준.

**부수 작업** (위 5건과 별도, BUG ID 미할당):
6. `activity` 단위 확정 — smaXtec 문서 기반.
7. 잔존 `Math.random()` sweep:
   - `admin.routes.ts:220-231` (관리자 데모용, 격리 또는 제거)
   - `lactation.routes.ts:88` (유량 예측)
   - `national-situation.service.ts:212` (주별 추이)
   - `early-detection-metrics.service.ts:197` (연도별 탐지율)
   - `unified-dashboard.routes.ts:2104, 2136, 2137, 2148` (체온 시뮬레이션 — UI 의도된 합성, 별도 판단)
8. 시도 합계 = 전국 합계 검증 잡 (L1·L3 일관성).
9. DB CHECK 제약 추가 — 백분율 필드에 `CHECK (val >= 0 AND val <= 100)` 마이그레이션.

## 13. Open Decisions (의사결정 대기)

v0.2에서 5개 모두 결정됨 (§0 Decision Log 참조).

| 항목 | 결정 | 결정 위치 |
|---|---|---|
| 수태율 정식 owner | 신규 `fertility-service.ts` | D1 |
| `decided` 정의 | 임신확정 + 공태확정 only (pending 제외) | D2 |
| 알림 카운트 단일 owner | 신규 `alert-aggregator.ts` (BUG-007에서 구현) | D3 |
| AI confidence 단위 | 내부 0–1 float, UI도 0.00–1.00 (BUG-005에서 구현) | D4 |
| 빈 농장 KPI 표시 | "—" (em dash) | D5 |

**남은 미결 항목**: 없음. 이후 결정 사항은 §0 Decision Log에 D7+ 로 추가.

---

## 14. AI Confidence 표기 규칙 (D4 정의)

**내부 표현**:
- 타입: `number` (float)
- 범위: `[0.0, 1.0]`
- 의미: 0.0 = 추정 불가/모름, 1.0 = 확실. 비율로 보지 말 것 (캘리브레이션은 §10.3 aiAccuracy로 별도 추적).

**UI 표현 규칙**:
- 라벨: **"신뢰도"** (한국어 고정)
- 형식: `{label} {value.toFixed(2)}` — 예: `"신뢰도 0.87"`
- 소수점 둘째 자리까지. 첫째 자리 또는 셋째 자리 금지.
- **금지**: `%` 부호, 정수 변환(`87%`), `${x*100}%`, "62%" 류 표기, "정확도"와 혼용.
- **금지**: "신뢰도 87점" 같은 임의 라벨링.

**예시**:
- ✅ `"이 진단 신뢰도 0.87"`
- ✅ `<span>신뢰도 {conf.toFixed(2)}</span>`
- ❌ `"신뢰도 87%"`
- ❌ `"AI 정확도 0.62"` ("정확도"는 §10.3 aiAccuracy 전용)
- ❌ `"61.9% 확실"` (D4 위반의 전형)

**aiAccuracy (정확도, §10.3)와의 분리**:
- "정확도"는 모델 자체의 성능 지표 → L3(관리자) 화면 **only**, 0–100% 표기 허용
- "신뢰도"는 개별 예측의 확신도 → L1·L2 사용자 화면, 0.00–1.00 표기

**구현**: 본 PR 비포함. BUG-005에서 일괄 교체. 교체 대상 위치는 §0 Decision Log의 "61.9% 류 표기 위치"에 정리.

---

## 15. 빈 농장 / 데이터 부족 표시 규칙 (D5 정의 + BUG-006 UI 강제)

**"빈 농장" 조건** (둘 중 하나라도 충족):
- 활성 센서 0개 (`smaxtecEvents` 최근 30일 0건 AND `sensorDevices` 0행)
- 최근 30일간 활성 동물 0두 또는 데이터 입력 0건

**서버 응답**:
- 메트릭 값: `null` (rate가 null), `0` 사용 금지 (0% 실값과 충돌)
- 예: `{ conceptionRate: null, conceptionRateDenom: 0 }`

**UI 표시**:
- 숫자 자리: **"—"** (em dash, Unicode U+2014)
- 라벨이 필요할 때: **"데이터 부족"**
- **금지 라벨**: "0", "N/A", "정상 운영", "데이터 없음 (중복)"
- **금지**: 0.0 또는 0%로 표시

**예시**:
- ✅ `<span>{cr.rate != null ? `${cr.rate.toFixed(1)}%` : "—"}</span>`
- ✅ `<TooltipContent>수태율 — (데이터 부족: 임신감정 기록 없음)</TooltipContent>`
- ❌ `{cr.rate ?? 0}%` → "0%"로 보임 (실값과 혼동)
- ❌ `{cr.rate || "정상 운영"}` (없는 데이터를 "정상"으로 표시 = 거짓말)

**적용 PR**:
- v0.2 (PR #33): 서버 측 `null` 반환 (fertility-service의 `CRResult.rate: number | null`)
- v0.3 (PR #34): herd-service의 D13 분리 + 7곳 UI 가드
- **v0.5 (BUG-006)**: UI 긍정 라벨 ("정상 운영", "이상 없음", "방역 양호") 제거 + 공통 컴포넌트 `MetricValue` 도입

---

### 15.1 D5 UI Rendering 규칙 (BUG-006)

**원칙**: 어떤 UI 위젯도 `status='data_insufficient'` 또는 빈 결과 상태에서 긍정 라벨로 렌더링하지 않는다.

**금지 라벨** (status='ok' 자리에 부활 금지):
- "정상 운영", "정상", "안전"
- "이상 없음", "이상없음", "이상 미발견"
- "양호", "건강함", "문제없음", "특이사항 없음"
- "방역 양호", "정상 작동", "건강 양호"
- ✅ / 👌 / 🟢 같은 긍정 이모지 단독 사용 (텍스트 없이)

**허용 표현** (사실 진술 / neutral):
- 숫자 + 단위: "0건", "0두", "0건 알림"
- "— (데이터 부족)" (em dash + 라벨)
- 색상: `var(--ct-text-secondary)` (neutral 회색)
- 위험/정상 색상(`#22c55e` 녹색, `#ef4444` 빨강) 사용 금지

**공통 컴포넌트**: `packages/web/src/components/common/MetricValue.tsx`

```tsx
interface Props {
  result: { displayValue: string; status: 'ok' | 'data_insufficient' };
  unit?: string;
  className?: string;
}
```

- `status='ok'` → `displayValue` + `unit` (caller가 색·크기 결정)
- `status='data_insufficient'` → `"—"` + neutral 색 + tooltip "충분한 데이터가 없습니다" + unit 숨김
- caller가 "정상 운영" 등으로 status='ok' 자리를 덮어쓰는 것을 컴포넌트 차원에서 차단

**호출처 (BUG-006에서 교체)**:
- `GovAdminDashboard.tsx:178` — "이상 없음" → unit "시도" (neutral)
- `SovereignAlarmFeed.tsx:96` — "이상 없음" → "활성 알림 0건" (사실 진술, neutral)
- `QuarantineDashboard.tsx:492` — "방역 양호" → "위험 등급 농장 0건" (사실 진술, neutral)
- `FarmDetailPage.tsx:HealthBadge` — null healthScore "—" neutral 배지
- `farm.api.ts:70` — `healthScore: 75` mock 폴백 제거 → `null`

**제외 (정당한 카테고리 라벨, D5 위반 아님)**:
- `farms.status='active'` enum 라벨 → "정상 운영" (실제 운영 상태)
- `healthScore >= 80 ? '양호'` 카테고리 등급 (real 값 분류, 데이터 부족 시 null 가드)
- `breedingScore >= 65 ? 'A 양호'` 등 grade 라벨

---

## 16. L3 Cluster Detection Thresholds — TBD

방역 L3 화면의 "위험 군집" 감지 기준. v0.2 시점에서 결정 대기.

| 변수 | TBD |
|---|---|
| 군집 정의 (지리 거리) | TBD (반경 km) |
| 군집 정의 (시간 윈도우) | TBD (24h / 48h / 7d) |
| 발열 군집 임계 (n농장 동시) | TBD |
| 호흡기 군집 임계 | TBD |
| 위험스코어 컷오프 (top 5 vs 자동 알람) | TBD |
| 시도 합계 vs 전국 합계 허용 오차 | TBD (% drift) |

→ 시연 시나리오 5단계 확정 후 별도 결정 라운드로 채움.

---

## 17. Change Log

| 일자 | 변경 | PR |
|---|---|---|
| 2026-05-15 | 수태율 113.1%, healthScore/tempStability 음수, demo 데이터 제거 | [#32](https://github.com/hhj3150/cowtalk/pull/32) |
| 2026-05-16 | 본 문서 v0.1 초안 (저장만, commit 없음) | — |
| 2026-05-16 | **v0.2**: Decision Log (D1–D6) + §14 AI Confidence + §15 빈 농장 + §16 L3 cluster TBD + fertility-service 도입 | [#33 BUG-001](https://github.com/hhj3150/cowtalk/pull/33) |
| 2026-05-16 | **v0.3**: Decision Log 확장 (D7–D14) + §8 우군 Herd 재작성 (herd-service.ts 신설, currentHeadCount 격하, province 집계, D13 분리). 12 호출처 + 1 mock 통합. | [#34 BUG-007 Part 1](https://github.com/hhj3150/cowtalk/pull/34) |
| 2026-05-16 | **v0.4**: §10 활성 알림 (D3 구현) — `alert-aggregator.ts` 신설. 878 vs 874 통일 (메인 KPI = AI 브리핑 widget preset 공유). 우선 3 사이트 교체: main KPI / AI 브리핑 / regional 마커. | [#35 BUG-007 Part 2](https://github.com/hhj3150/cowtalk/pull/35) |
| 2026-05-16 | **v0.5**: §15.1 D5 UI Rendering 강제 — 긍정 라벨("정상 운영"/"이상 없음"/"방역 양호") 제거. `MetricValue` 공통 컴포넌트 신설. healthScore mock 폴백 제거 (`?? 75` → null). | BUG-006 PR (본 PR) |

---

## 부록 A — 메트릭 카탈로그 요약 (스캔용)

**Demo-Readiness 표기**: ✅ 시연 핵심 (반드시 정확) / 🟡 보조 (있으면 좋음) / ⬜ 비공개 (시연 미사용). 시연 시나리오 5단계 확정 후 갱신 예정.

| 도메인 | 메트릭 | 단위 | 범위 | 검증 | Owner | Demo |
|---|---|---|---|---|---|---|
| 번식 | 수태율 CR | % | 0–100 / null | Clamp | **fertility-service** (D1) | ✅ |
| 번식 | 발정탐지율 EDR | % | 0–100 | Clamp | breeding-pipeline | ✅ |
| 번식 | 임신율 PR | % | 0–100 | Clamp (합성) | breeding-pipeline | 🟡 |
| 번식 | 평균공태일 | 일 | 0–730 | Clamp | breeding-pipeline | 🟡 |
| 번식 | 분만간격 | 일 | 250–600 | Warn | breeding-pipeline | ⬜ |
| 번식 | 첫수정일수 | 일 | 30–365 | Clamp | breeding-pipeline | ⬜ |
| 번식 | 산차 | count | 0–10 | Reject | smaXtec sync | ⬜ |
| 번식 | DIM | 일 | 0–305 | Warn | profile-builder | 🟡 |
| 건강 | healthScore | score | 0–100 | Clamp ✅ | unified-dashboard | ✅ |
| 건강 | tempStability | score | 0–100 | Clamp ✅ | unified-dashboard | 🟡 |
| 건강 | sensorRate | % | 0–100 | Clamp ✅ | unified-dashboard | ⬜ |
| 건강 | 체온 | ℃ | 35–42.5 | Reject | sensor-pipeline | ✅ |
| 건강 | 활동량 | TBD | TBD | TBD | sensor-pipeline | 🟡 |
| 건강 | 반추시간 | 분/일 | 200–600 | Warn | sensor-pipeline | 🟡 |
| 건강 | 회복률 | % | 0–100 | Clamp | treatment-outcome | ⬜ |
| 우군 | 두수 | count | 0–5000 | — | farm-service | ✅ |
| 우군 | 착유우/건유우 비율 | % | 0–100 | Clamp | farm-service | ⬜ |
| 우군 | 평균산차 | count | 0–5 | — | farm-service | ⬜ |
| 경제 | 유량/유지방/유단백/SCC | TBD | TBD | Reject | dhi-connector (미구현) | ⬜ |
| 경제 | 등급/경락가 | grade/₩ | enum/[5000, 20000] | API 신뢰 | grade-connector | ⬜ |
| 알림 | activeAlerts | count | 0–∞ | — | **alert-aggregator** (D3, BUG-007) | ✅ |
| 알림 | unhandledRate | % | 0–100 | Clamp ❌ | TBD (BUG-008) | ⬜ |
| 알림 | aiAccuracy (정확도) | % | 0–100 | Clamp | label-service (L3 only) | ⬜ |
| 알림 | confidence (신뢰도, per alert) | 0.00–1.00 (D4) | 0–1 | TBD | claude-interpreter | 🟡 |
| 방역 | 위험농장 수 | count | 0–N | — | quarantine-dashboard | ✅ |
| 방역 | 의심사례 | count | 0–N | — | quarantine-dashboard | ✅ |
| 방역 | 24h 추이 | count/h | 0–N | — | quarantine-dashboard | ✅ |
| 방역 | 집단발생률 | % | 0–100 | Clamp | quarantine-dashboard | 🟡 |
| 방역 | 위험스코어 | score | 0–100 | Clamp | quarantine-dashboard | ✅ |
| 방역 | 전국/시도별 집계 | 메트릭별 | 동일 | 일관성 잡 필요 | national-situation | ✅ |
