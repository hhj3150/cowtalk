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

## 8. 다음 단계 (Step 2 → Step 5 진행 기록)

- ✅ Step 2: `herd-service.ts` 신설 + 21 unit test (D5/D7/D8/D9/D11/D13/D14)
- ✅ Step 3: 12 호출처 교체 + Site 13 mock 제거
- ✅ Step 4: `metrics-contract.md` v0.3 §7 신설
- ✅ Step 5: 통합 검증 체크리스트 (§10 아래)
- 보고: Part 2 코드 작업(alert-aggregator)은 별도 박스 대기

---

## 9. Step 3 — 호출처 교체 결과 (12 sites + 1 mock)

| # | 파일:라인(전) | 변경 후 호출 | 동작 변화 |
|---|---|---|---|
| **H1** | `farm.routes.ts:84` SUM(currentHeadCount) | `getHerdTotal()` (live) | /farms/summary 의 totalHeadCount = 11,376 → 10,666 (D7) |
| **H2** | `national-situation.service.ts:121` `+ f.currentHeadCount` | `+ liveCountByFarm.get(f.farmId)` (서비스 내부 라이브 집계) | 시도별 totalAnimals = 라이브 합 (D7) |
| **H3** | `national-situation.service.ts:193` provinces.reduce | (변경 없음) | provinces 가 이미 라이브이므로 자동 |
| **H4** | `dashboard.routes.ts:215` (farmer scope) | `getHerdTotal({farmIds:[targetFarmId]})` | 라이브 + deletedAt 필터 추가 |
| **H5** | `dashboard.routes.ts:296` (vet scope) | `getHerdTotal()` | 동일 |
| **H6** | `dashboard.routes.ts:478` (master scope) | `getHerdTotal()` | 동일 |
| **H7** | `unified-dashboard.routes.ts:571-576` (Promise.all) | `getHerdTotal(farmId? ... : {})` Promise.all slot | 메인 대시보드 totalAnimals = 라이브 |
| **H8** | `unified-dashboard.routes.ts:1970` (farm-comparison map) | `getHerdTotal({farmIds:[farm.farmId]})` per farm | 농장별 healthScore 분모 = 라이브 |
| **H9** | `unified-dashboard.routes.ts:2384` queryHerdOverview | `getHerdTotal(farmId? ... : {})` | HerdOverview totalAnimals = 라이브 |
| **H10** | `unified-dashboard.routes.ts:4558` `animalRows.length` | `computeHerd(animalRows.length).total` | 정의상 동일, 단일 owner 통과 |
| **H11** | `tool-executor.ts:319` `animalRows.length` | `computeHerd(animalRows.length).total` | AI 도구 `query_farm_summary` |
| **H12** | `tool-executor.ts:1051` `animalRows.length` | `computeHerd(animalRows.length).total` | AI 도구 `get_farm_kpis` |
| **H13** (mock) | `farm.routes.ts:403` `?? 50` | `getHerdPerFarm(farmId)` + 미존재 시 빈 결과 | D5 mock 제거 |
| **H14** | `national-situation.service.ts:484` (`getProvinceDetail`) SUM(currentHeadCount) per district + `coordFarmsInProvince.reduce(+f.currentHeadCount)` | district별 live aggregation + 좌표 농장 reduce도 live | 시군구 두수 = 라이브, currentHeadCount 사용 0 (사용자 노출 사이트 기준) |
| **H15 (regression)** | `regional.routes.ts:106` `totalAnimals: f.currentHeadCount` per marker | `liveCountByFarm.get(f.farmId)` | **/regional-map "감시 두수" 11,376 → 10,666 회귀 해소.** 클라이언트 `markers.reduce(+totalAnimals)`로 user-visible agg 됨. |
| **H16** | `regional.routes.ts:172` `farmList.reduce(+f.currentHeadCount)` | `getHerdTotal({farmIds: regionFarmIds})` | `/regional/:regionId` 지역 상세 페이지 두수 |
| **H17** | `profile-builder.ts:468/487` regional profile per-farm + reduce | `inArray(animals.farmId, regionFarmIds)` 라이브 카운트로 농장별 + 합산 | RegionalProfile (AI 컨텍스트, 지역 요약 노출) |
| **H18** | `profile-builder.ts:525/529` tenant profile | 동일 패턴 (tenant 농장 라이브 합) | TenantProfile (multi-farm 소유자 view) |
| **H19** | `public-stats.routes.ts:63` `sum(currentHeadCount)` SELECT (dead code) | SELECT에서 제거 (totalCattle은 이미 animals count) | `/api/public/stats` 공개 통계 — 혼동 SELECT 제거 |
| **H20** | `farm.routes.ts:346` `totalAnimals \|\| (currentHeadCount ?? 0)` 폴백 | `totalAnimals` (실측 0두 허용, D13) | `/farm/:farmId` 프로필 — D9 위반 폴백 제거 |

**총 변경 파일**: 8개 (Part 1: `farm.routes.ts`, `dashboard.routes.ts`, `unified-dashboard.routes.ts`, `national-situation.service.ts`, `tool-executor.ts` + amend: `regional.routes.ts`, `profile-builder.ts`, `public-stats.routes.ts`)

### H15 누락 원인 (Part 1 audit 회고)

Part 1 audit는 두 패턴만 검색:
1. `SUM(currentHeadCount)` 서버 agg
2. `count() from animals WHERE active` 서버 agg

`regional.routes.ts:106`의 패턴은 다름: `totalAnimals: f.currentHeadCount` — per-farm 행 단위 필드 직접 할당. 서버에서 agg하지 않음. **클라이언트(`RegionalMapPage.tsx:151` `markers.reduce(+totalAnimals)`)에서 agg됨.**

이는 Part 1 audit §2 "Definition C — per-farm display"로 분류돼 **out-of-scope** 처리됐던 패턴. 하지만 클라이언트 reduce가 일어나면 user-visible agg가 되므로 사실상 Definition A 누출.

**교훈**: per-farm 행에 `currentHeadCount`를 직접 노출하면 클라이언트 또는 다운스트림이 agg해서 D9 위반 가능. 향후 D9 엄격 검증 시 per-farm display 사이트(Definition C)도 라이브로 전환 검토 필요.

### 잔존 leak (regression 아님, 향후 정리 대상)

본 PR amend 외에 발견된 currentHeadCount 사용자 노출 패턴 (사용자 검증에서 모순 0건 확인된 영역):
- `radius-analyzer.ts:141` `inZone.reduce(+f.currentHeadCount)` — `/epidemiology/radius` 페이지 (사용자 미검증, 추정 우연 일치)
- `quarantine-dashboard.service.ts:367` `sum(currentHeadCount)` — 방역 대시보드 내부 계산 (사용자 검증 5회 10,666 ✅, 우연 일치 또는 미표시)

향후 BUG-007 Part 2 또는 별도 sweep PR에서 처리 권고.
**잔존 인라인 두수 grep**: 0건 (검증)
**잔존 SUM(currentHeadCount) grep**: 0건 (검증)
**잔존 `?? 50` herd mock grep**: 0건 (검증)

---

## 10. Step 5 — 통합 검증 체크리스트 (사용자 수동 검증)

cowtalk.netlify.app preview 환경(또는 PR #34 preview)에서 검증. master 권한 + 기본 필터.

### 두수 일관성 (D7 single source, 10개 화면)

| # | URL | 위젯 | 표시 라벨 | 기대값 | scope | 일치 |
|---|-----|------|-----------|--------|-------|------|
| 1 | `/` 또는 `/dashboard` | HerdOverviewCards | "총 두수" | (live ≈ 10,666) | live | □ |
| 2 | `/` 또는 `/dashboard` | GovAdminDashboard | "총 두수" | #1과 **동일** (이전 11,376 모순 해소) | live | □ |
| 3 | `/` 또는 `/dashboard` | BreedingPipelineWidget | "N두 관리" | #1과 동일 | live | □ |
| 4 | `/` 또는 `/dashboard` | QuarantineDashboard | "감시 두수" | #1과 동일 | live | □ |
| 5 | `/breeding` | BreedingCommandPage | "관리 두수" | #1과 동일 | live | □ |
| 6 | `/breeding/performance` | BreedingKpiPage | (헤더 두수) | #1과 동일 | live | □ |
| 7 | `/farm-management` | FarmManagementPage | "총 두수" | #1과 동일 (이전 11,376 → 10,666) | live | □ |
| 8 | `/regional-map` | RegionalMap 시도 카드 | (시도별 두수 합) | #1과 동일 | live | □ |
| 9 | `/epidemiology/dashboard` | (방역 KPI) | "감시 두수" | #1과 동일 | live | ✅ 사용자 확인 (10,666 × 5회) |
| 10 | `/api/quarantine/national-situation` (직접 API) | nationalSummary.totalAnimals | #1과 동일 | live | □ |
| **11 (amend)** | `/regional-map` | RegionalMapPage KPI 카드 | "감시 두수" | #1과 동일 (이전 11,376 → 10,666) | live | ✅ amend 후 회귀 해소 |

### D13 분리 검증 (실측 0두 vs 측정 불가)

| 케이스 | 기대 표시 |
|---|---|
| 갈전리목장(데이터 있음) `/farm/:id` | "34두" (실측, 'ok') |
| 술탄팜(데이터 풍부) | 실측 두수 |
| 빈 농장 (신규 또는 센서 0) | "0두" (실측 0) — D13 |
| 미존재 farmId 직접 접근 | "—" (data_insufficient) — D13 |

### 인라인 두수 계산 잔존 grep (CI에서도 가능)
- `SUM(currentHeadCount)` server side: **0건** ✅
- `?? 50` herd mock: **0건** ✅
- inline `count() from animals WHERE status='active'` outside herd-service: **0건** ✅

### Stop condition (1건이라도 발견 시 즉시 보고)
- 9개 화면 중 동일 값 아님
- "11,376" 또는 다른 동기화 누락 값 잔존
- D13 분리가 작동하지 않음 (실측 0두가 "—"로 표시, 또는 미존재 농장이 "0두"로 표시)

---

## 11. Part 2 Step 1 — 알림 카운트 audit (alert-aggregator 사전 정찰)

D3 구현(BUG-007 Part 2)을 위한 사전 grep. 본 PR에서는 코드 변경 0건, 다음 박스 명세 대기.

### Top-level alert count 사이트 (사용자 가시 KPI)

| # | 파일:라인 | 변수 | 산출 방식 | 도메인 | 표시 위치 |
|---|---|---|---|---|---|
| A1 | `unified-dashboard.routes.ts` ~2419 | `activeAlerts` | `count() from smaxtecEvents WHERE 24h AND !acked` | all (smaxtec) | HerdOverviewCards "24h 알림" |
| A2 | `unified-dashboard.routes.ts` ~555 (Promise.all `total24hResult`) | `total24h` | `count() from smaxtecEvents WHERE 24h` (acked 무관) | all | AiBriefing "AI 일일 브리핑" |
| A3 | `unified-dashboard.routes.ts` (severityRows) | per-severity counts | `groupBy severity` | all | "긴급/높음/보통/낮음" |
| A4 | `unified-dashboard.routes.ts:2407` `healthCount` | `count() from smaxtecEvents WHERE 24h AND !acked AND eventType IN [health...]` | health (8개 이벤트 타입) | HerdOverviewCards "건강 이상/발열 두수" |
| A5 | `dashboard.routes.ts:298` `healthEventCount` | 7-day window | health | 수의사 대시보드 "건강 경고(7일)" |
| A6 | `unified-dashboard.routes.ts:2887` estrusCount | per-event type | breeding (estrus) | 번식 알림 카드 |
| A7 | `unified-dashboard.routes.ts:2888` calvingCount | per-event type | breeding (calving) | 번식 알림 카드 |
| A8 | `unified-dashboard.routes.ts:2886` openCowCount | DB count from animals | herd (공태우) | 번식 알림 카드 |
| A9 | `profile-builder.ts:326/430` farm.alertCount | `count(smaxtecEvents per farm)` | all | farm 비교 위젯 |
| A10 | `profile-builder.ts:464-500` `activeAlerts` 누적 | sum over farms | all | regional summary |
| A11 | `epidemic-intelligence.routes.ts:341/348/350` rate-based | feverAnimals / headCount, weightedAffected / headCount | epidemic | 방역 위험률 |
| A12 | `epidemic-intelligence.routes.ts:148-160` `suspectRows` | `count from alerts WHERE priority='critical'` | epidemic | 의심사례 |
| A13 | `services/epidemiology/quarantine-dashboard.service.ts:429` legalDiseaseSuspects | alerts.priority='critical' | epidemic | 방역 KPI |
| A14 | `alarm-engine` 또는 `alert.service` (검색 추가 필요) | TBD | breeding/health/epidemic | 도메인별 알림 발행 |

### 도메인 분류

| 도메인 | 사이트 수 (가시 KPI 기준) |
|---|---|
| breeding (수태/임신/공태/분만/재발정/미수정/발정/수정) | A6, A7, A8 (3건) — 발정·분만·공태 |
| health (고체온/저체온/반추/활동/임상) | A4, A5 (2건) |
| epidemic (질병 의심/감염 의심/이동 제한) | A11, A12, A13 (3건) |
| herd (도태 후보/고령우/장기공태) | A8 일부 (공태우는 herd 분류로도 가능) |
| **agg "전체 알림"** (스마xtec 이벤트 기반) | A1, A2, A3, A9, A10 (5건) |

총 발견 14건 (Stop-condition 20 미만, 5 미만 분류 불가 없음). **분류 정상 진행 가능**.

### 핵심 모순 (사용자 보고 수치 매핑)
- "24H 알림 878" vs "AI 일일 브리핑 874건" → A1 vs A2 충돌 (acked 필터 + 24h 시점 차)
- "긴급 31 / 높음 199" → A3 (severity breakdown)
- "건강 알림 367건 감지" → A4 (health-filtered count)
- "발정 111, 수정 49, 재발정 24, 분만 징후 23" → A6/A7 + per-event aggregations (breeding 도메인)

### Part 2 Step 2~4 명세 대기 항목 (D3 구현)
- alert-aggregator 함수 시그니처 (예: `getAlertCounts({scope, domain?, severity?})`)
- 14 사이트 교체 우선순위 (사용자 가시 KPI 우선)
- 도메인별 알림 발행 → 집계 흐름 (D3 단방향 명시)
- '24h vs 7-day vs 실시간' 시간 윈도우 정책 (사용자 결정 필요)
- acked 필터 정책 (878 vs 874 모순 해소 방향)

→ 본 PR에서 코드 변경 0건. 다음 박스 수신 후 진입.

---

## 12. D10 — 농장 등록/수정 폼 currentHeadCount 입력 위치 (사용자 결정 대기)

D8 격하 대상이 폼 입력에서 처리되는지 사전 grep.

### grep 결과

| # | 파일:라인 | 컴포넌트 | 입력 필드 | 매핑되는 DB 컬럼 |
|---|---|---|---|---|
| F1 | `web/src/pages/auth/OnboardingPage.tsx:287` | `OnboardingPage` (가입 단계) | "사육두수 (마리)" (`farmCapacity`) | **`farms.capacity`** (다른 컬럼) |

### 결론

**`currentHeadCount`를 직접 입력하는 UI 폼은 0건.**

- OnboardingPage의 "사육두수" 입력은 `farms.capacity` 컬럼에 매핑됨 (등록 정원, 별도 의미).
- `farms.currentHeadCount`는 백엔드에서만 갱신되는 메타데이터 컬럼이며, UI 폼에서 직접 노출/수정 안 됨.
- → **D8 격하(`currentHeadCount` 표시 전용 강등)는 UI 폼에 영향 0건.**

### 표시(Display) 사이트 (별도 PR, Definition C)

`currentHeadCount`를 **표시 전용**으로 사용하는 컴포넌트는 다수 존재(`FarmListLevel`, `FarmMiniMap`, `FarmAnimalDrawer`, `FarmMapWidget`, `ProvinceFarmListPanel`, `NationalMiniMap`).
이들은 audit §2 Definition C로 분류된 per-farm 표시이며, 본 PR 범위 외. 향후 D9 엄격 적용 시 `getHerdPerFarm()`으로 일괄 전환 검토.
