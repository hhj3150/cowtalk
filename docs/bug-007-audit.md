# BUG-007 Audit — 두수 단일 소스 + 알림 카운트 단일 owner

> 2026-05-16. 두수 11,376 vs 10,666 불일치 근본 원인 + alert-aggregator 신설 근거.
> Step 2 함수 시그니처는 사용자 박스 잔여분 대기 중.

## Stop-Condition Check

| 항목 | 결과 |
|---|---|
| 발견된 두수 계산 사이트 수 | **12** (예상 3–15 범위 안) |
| 발견된 두수 정의 분기 | **2개** (A: SUM(currentHeadCount), B: COUNT(animals)) — 사용자 브리프 4개 미만, 통과 |
| 11,376 vs 10,666 발생 원인 | **확정** — A vs B 데이터 소스 분기 |
| Math.random() 등 mock fallback | 1건 발견 (`farm.routes.ts:403 ?? 50`) — 별도 처리 권고 |

Stop-condition 어디에도 해당 안 함. **정상 진행 가능.**

---

## 1. 근본 원인 (Root Cause)

**같은 페이지에서 11,376 vs 10,666이 동시에 보이는 이유**:

### Definition A — `SUM(farms.currentHeadCount)` (저장값, 수동 유지)
- **표시 위치**: 행정 통합 페이지 ("축산 행정 현황판"), `/farm-management`, 메인 대시보드의 `GovAdminDashboard` 위젯
- **출처**:
  - `server/api/routes/farm.routes.ts:84` — admin 통계 API
  - `server/services/epidemiology/national-situation.service.ts:474` — 전국 방역 API
- **값**: **11,376두**
- **의미**: 농장이 자기 농장 등록 시 입력한 `currentHeadCount`의 단순 합. 동물 인서트/삭제와 동기화되지 않을 수 있음.

### Definition B — `COUNT(animals WHERE status='active')` (라이브 카운트)
- **표시 위치**: 메인 대시보드 `HerdOverviewCards`, `/breeding`, `/dashboard`, 모든 농장/수의사/방역관 KPI 카드
- **출처**:
  - `server/api/routes/dashboard.routes.ts:242/408/513`
  - `server/api/routes/unified-dashboard.routes.ts:659/1970/2417`
  - `server/api/routes/unified-dashboard.routes.ts:4558` (`animalRows.length` for breeding-pipeline)
  - `server/ai-brain/tools/tool-executor.ts:319/1051` (AI 도구)
- **값**: **10,666두**
- **의미**: `animals` 테이블에서 `status='active' AND deletedAt IS NULL` 조건 카운트. 실시간 라이브.

### 차이의 의미

**11,376 − 10,666 = 710두**. 이 710두는:
1. **시나리오 a**: 농장이 등록한 currentHeadCount보다 animals 테이블에 인서트된 active 동물이 적다 (가능성 높음 — smaXtec 동기화 누락 또는 사용자 미입력)
2. **시나리오 b**: animals.status가 'inactive'/'culled'/'sold'로 전환됐는데 farms.currentHeadCount는 업데이트 안 됨
3. **시나리오 c**: deletedAt이 set됐는데 currentHeadCount 미반영
4. **시나리오 d**: 두 정의 모두 잘못 — 정답은 제3의 정의 (예: `COUNT(animals WHERE status IN ('active', 'dry_off', 'lactating'))`)

→ **Step 2에서 fertility-service 패턴처럼 단일 owner를 정해야 함.**

---

## 2. 발견된 사이트 — 전수 표

### Definition A (SUM(currentHeadCount)) — 1 라우트 + 1 서비스

| # | 파일 | 라인 | 변수/필드 | 산출 | 표시 위치 |
|---|---|---|---|---|---|
| **H1** | `api/routes/farm.routes.ts` | 84-108 | `totalHeadCount` | `SQL: COALESCE(SUM(farms.currentHeadCount), 0)` | `/farm-management` (admin 농장 통계 API) |
| **H2** | `services/epidemiology/national-situation.service.ts` | 474 | `totalAnimals` (provinceAgg) | `SUM(farms.currentHeadCount)` group by province | `GovAdminDashboard` "총 두수" 11,376, 시도별 카드 |
| **H3** | `services/epidemiology/national-situation.service.ts` | 193 | `totalAnimals` (national rollup) | `provinces.reduce(s+totalAnimals)` | 전국 종합 KPI |

### Definition B (COUNT(animals WHERE status='active')) — 8 사이트

| # | 파일 | 라인 | 변수/필드 | 산출 | 표시 위치 |
|---|---|---|---|---|---|
| **H4** | `api/routes/dashboard.routes.ts` | 242 | `totalAnimals` | `count() from animals WHERE farmId=X AND status='active'` | `/dashboard` 농장주 "사육 두수" |
| **H5** | `api/routes/dashboard.routes.ts` | 408 | `totalAnimals` | `count() from animals` (vet scope) | `/dashboard` 수의사 "총 두수" |
| **H6** | `api/routes/dashboard.routes.ts` | 513 | `totalAnimals` | `count() from animals` (master scope) | `/dashboard` 마스터 "총 두수" |
| **H7** | `api/routes/unified-dashboard.routes.ts` | 659 | `totalAnimals` | `count() from animals WHERE active` | unified-dashboard `HerdOverviewCards` 데이터 |
| **H8** | `api/routes/unified-dashboard.routes.ts` | 1970 | `totalAnimals` | `count() from animals WHERE farmId=X AND active` | `/dashboard/farm-comparison` 농장별 |
| **H9** | `api/routes/unified-dashboard.routes.ts` | 2417 | `totalAnimals` | `count() from animals` | unified-dashboard 다른 엔드포인트 |
| **H10** | `api/routes/unified-dashboard.routes.ts` | 4558 | `totalAnimals` | `animalRows.length` (active farm row count) | `BreedingPipelineWidget` "N두 관리" 10,666 |
| **H11** | `ai-brain/tools/tool-executor.ts` | 319 | `totalHead` | `animalRows.length` | AI 도구 `query_farm_summary` |
| **H12** | `ai-brain/tools/tool-executor.ts` | 1051 | `totalHead` | `animalRows.length` | AI 도구 `get_farm_kpis` |

### Definition C (per-farm `currentHeadCount`) — 별도 의미, 본 PR 범위 외

농장별 카드 표시용으로 `farms.currentHeadCount` 컬럼을 직접 조회하는 사이트:
- `farm.routes.ts:173, 403`
- `epidemic-intelligence.routes.ts:144/161/171/337/838/957`
- `economics.routes.ts:31/60/173`
- `unified-dashboard.routes.ts:1962/3771/3809`

이들은 **단일 농장의 등록 두수**를 표시하며 agg total과 무관. 본 PR에서는 건드리지 않음 (Definition A의 building block이므로 A 정책이 결정되면 이들도 그 정책 따라감).

### Production-path Mock 1건 (별도 처리 필요)

- `farm.routes.ts:403`: `const headCount = currentFarm?.currentHeadCount ?? 50;`
  - 농장이 currentHeadCount 미입력일 때 **50두로 가짜 표시** — PR #32 패턴 위반
  - 처리 권고: `?? null` + UI는 "데이터 없음" (D5 패턴)

---

## 3. 정의 분기 (BUG-007에서 결정 필요)

사용자가 Step 2에서 정해야 할 핵심 결정:

### 결정 D7 (제안) — 두수 단일 정의

| 옵션 | 의미 | 장점 | 단점 |
|---|---|---|---|
| **(A) SUM(currentHeadCount)** | 농장 등록값 합 | DB 컬럼 직접 — 빠름 | 동물 인서트/삭제 동기화 누락 시 stale |
| **(B) COUNT(animals WHERE active)** | 라이브 active 동물 | 항상 정확한 라이브 | 매 요청마다 카운트 (캐시 필요할 수도) |
| **(C) COUNT(animals WHERE status IN [...])** | 정책 명시 active+lactating+dry+ ... | 의미 명확 | 어느 상태 포함할지 결정 필요 (Phase 2 status enum 정렬 의존) |
| **(D) currentHeadCount 자동 동기화 + (A) 사용** | 양쪽 통합 | 가장 robust | trigger/cron 인프라 필요 |

**권고: (B)**. 이유:
1. fertility-service 패턴(`pregnancyChecks` 직접 카운트) 일관성.
2. PR #32 "Math.random()/mock 제거" 정신 — stale stored value보다 라이브 카운트 신뢰.
3. currentHeadCount 컬럼은 보조 메타데이터로 격하 (편집 화면용 표기, agg 계산 비참여).
4. **Phase 2 권한 격리 인프라**가 도입되면 `WHERE farmId IN (auth scope)` 자동 적용 자연스러움.

단, **D6 다음 BUG-006 (DIM 자동 전이)**가 status enum을 정비하므로, BUG-007에서는 일단 `status='active'` 기준으로 가고, BUG-006 후 `WHERE status IN ('active', 'lactating', 'dry_off', 'cull_review')` 확장 검토.

### 결정 D8 (제안) — `currentHeadCount` 컬럼 운명

- (A) 유지 + 자동 동기화 trigger 도입 (insert/delete animals → update currentHeadCount)
- (B) 유지 + 표시 전용 (agg 계산 비참여, 농장 자기 입력값으로 의미만)
- (C) 폐기 + COUNT(animals)로 대체

**권고: (B)**. 정의 D7 (B) 채택 시 자연스러움.

---

## 4. Step 2 함수 시그니처 — 사용자 박스 잔여분 대기

`packages/server/src/services/metrics/herd-service.ts` 신규 예정.

추정 시그니처 (사용자 박스 본문 받으면 교체):
```typescript
// 미확정 — 사용자 결정 대기
export interface HerdResult {
  readonly total: number;             // 활성 동물 두수
  readonly displayValue: string;      // "10,666두" (로케일 포맷)
  readonly status: 'ok' | 'data_insufficient';
}

// 미확정 옵션
export async function getHerdTotal(opts: { farmIds?: readonly string[]; scope?: 'master' | 'farm_owner' | 'vet' | 'quarantine' }): Promise<HerdResult>;

export async function getHerdPerFarm(farmId: string): Promise<HerdResult>;
```

→ 사용자 시그니처 확정 후 즉시 Step 2 진입.

---

## 5. Definition A → B 마이그레이션 영향 (Step 3 사전 검토)

만약 D7 (B) 채택 시 시현되는 변화:

| 사이트 | Before | After | UI 영향 |
|---|---|---|---|
| `/farm-management` admin 통계 | 11,376 | 10,666 | 행정 카운터 -710두. 정합성 회복. |
| `GovAdminDashboard` "총 두수" | 11,376 | 10,666 | 동일하게 -710. 메인 대시보드 모순 해소. |
| `/quarantine/national-situation` 시도별 | SUM(currentHeadCount) per 시도 | COUNT(animals) per 시도 | 시도별 합계가 변동. 발열률 분모 변동 → 비율 약간 변화. |
| 나머지 (B 정의 이미 사용) | COUNT | COUNT | **무변화** |

→ Definition A 사용처 3건만 변경, B 사용처 9건은 그대로. 코드 변경 surface 작음.

---

## 6. 알림 카운트 단일 owner (D3, alert-aggregator) — 사전 정찰

Step 2/Part 2에서 다룰 예정. 현재는 사전 grep만:

- `server/api/routes/alarm.routes.ts` 또는 `events.routes.ts` 에서 활성 알림 카운트 추정
- 메인 대시보드 "24h 알림" 카드: `HerdOverviewCards.tsx:DEFAULT_CARDS` 키 `activeAlerts`
- D3 사양: 각 도메인 서비스(번식/건강/방역/우군)가 알림 발행 → `services/alerts/alert-aggregator.ts`가 1회 집계
- 본 audit에서는 alert 사이트 grep까지는 보류 — 두수 작업 끝낸 후 Part 2 명세 받으면 그때 audit 확장.

---

## 7. 검증 계획 (Step 3 이후 예정)

- pure 함수 unit test (`herd-service.test.ts`):
  - 빈 농장 → total=0 + status='data_insufficient'?
  - 라이브 카운트 정확성
  - master/vet/farm_owner scope별 결과 분기
- 통합 회귀:
  - 변경 전후 11,376 vs 10,666 → 머지 후 같은 숫자
  - `/farm-management` + `/dashboard` + `/breeding` + `GovAdminDashboard` 모두 동일 값
  - 시도별 합계 = 전국 총계 (national-situation 일관성)

---

## 8. 다음 단계

- 사용자: Step 2 함수 시그니처 + Step 3 호출처 교체 명세 + Part 2 alert-aggregator 구조 명세 전달
- Claude Code: 명세 수신 즉시 Step 2 진입 (herd-service.ts 신설 + 12 사이트 교체 + per-farm Definition C 정책 적용 + farm.routes.ts:403 ?? 50 mock 제거)
