# BUG-007 Part 2 Audit — alert-aggregator 도입 (D3)

> 2026-05-16. 알림 카운트 단일 owner (D3) 구현 근거.
> 시연 일정 없음. 카우톡 v5.0 품질 우선.

## 0. 핵심 모순 해소

| 위젯 | Before | After |
|---|---|---|
| 메인 대시보드 "24H 알림" | **878** (24h, `acknowledged=false`) | `getAlertCountForWidget('main_24h_alerts')` |
| AI 일일 브리핑 | **874** (24h, acked 필터 없음) | `getAlertCountForWidget('ai_briefing_24h')` |
| 차이 출처 | 4건 acked → 한쪽에서만 제외 | 동일 widget preset → **동일 값 보장** |

→ widget preset에서 `ai_briefing_24h`가 `main_24h_alerts`와 100% 동일 opts (`{window: '24h', ackedFilter: false}`). unit test로 강제됨.

---

## 1. Stop-condition check

| 항목 | 결과 |
|---|---|
| 발견된 alert count user-visible site 수 | **20+** (Part 1 audit 14건 + 본 회차 추가 6건) |
| 도메인 분류 불가 | 0건 (4개 도메인: breeding/health/epidemic/herd + agg all) |
| 한 알림이 도메인 2개 동시 속함 | 0건 (`resolveDomainEventTypes` 도메인 간 중복 unit test로 검증) |

Stop-condition 미달, 정상 진행.

---

## 2. alert-aggregator.ts 설계

**파일**: `packages/server/src/services/alerts/alert-aggregator.ts` (250+ 줄)

**Public API**:
- **Types**: `AlertWindow`, `AlertSeverity`, `AlertStatus`, `AlertDomain`, `AlertOpts`, `AlertCountResult`
- **Pure helpers** (DB 없이 unit test):
  - `buildAlertCountResult(rawCount)` — D5/D13 패턴 (0='ok' '0', NaN/음수='data_insufficient' '—')
  - `computeAlertCount(rawCount)` — alias
  - `windowToCutoff(window, now?)` — 시간 윈도우 → Date 또는 null('live')
  - `resolveDomainEventTypes(domain)` — 도메인 → eventType 배열 (또는 null='all')
  - `aggregateAlertRowsByProvince(rows)` — 좌표 row → 시도별 Map (9 시도 항상 포함)
  - `listWidgetPresets()` — widget preset 목록 (외부 검사용)
- **DB wrappers**:
  - `getActiveAlerts(opts)` — 표준 카운트
  - `aggregateAlertsByDomain(opts)` — `Record<AlertDomain, AlertCountResult>`
  - `aggregateAlertsByFarm(opts)` — `ReadonlyMap<farmId, number>` (마커·랭킹용)
  - `aggregateAlertsByProvince(opts)` — `ReadonlyMap<province, AlertCountResult>`
  - `getAlertCountForWidget(widgetId, override?)` — widget preset + override

**Domain → eventType 매핑**:
| Domain | eventTypes |
|---|---|
| breeding | estrus, heat, estrus_dnb, insemination, no_insemination, pregnancy_check, calving_detection, calving_confirmation, abort, dry_off |
| health | temperature_high/low/warning, rumination_decrease, activity_decrease/increase, drinking_decrease, health_warning/alert/general, ph_low, clinical_condition |
| epidemic | health_103 (법정전염병 의심, 확장 가능) |
| herd | mortality, death, culling, cull |
| all | null (필터 없음) |

unit test로 도메인 간 eventType 중복 0건 검증.

**Widget presets** (D3 일관성 강제):
| widgetId | opts |
|---|---|
| `main_24h_alerts` | `{window: '24h', ackedFilter: false}` |
| `main_health_issues` | `{window: '24h', ackedFilter: false, domainFilter: 'health'}` |
| `main_breeding_alerts` | `{window: '24h', ackedFilter: false, domainFilter: 'breeding'}` |
| `main_epidemic_alerts` | `{window: '24h', ackedFilter: false, domainFilter: 'epidemic'}` |
| `ai_briefing_24h` | `{window: '24h', ackedFilter: false}` ← `main_24h_alerts`와 동일 |
| `regional_marker_24h` | `{window: '24h', ackedFilter: false}` |
| `epidemiology_dashboard` | `{window: '24h', ackedFilter: false}` |
| `epidemic_critical` | `{window: '24h', ackedFilter: false, severity: 'critical'}` |

---

## 3. Unit tests — 30/30 통과 (16ms)

`packages/server/src/services/alerts/__tests__/alert-aggregator.test.ts`

| describe | 케이스 수 | 검증 항목 |
|---|---|---|
| `buildAlertCountResult` (D5/D13) | 8 | 0='ok' '0', 음수/NaN/Infinity='data_insufficient' '—', 천단위 콤마, Math.floor, computeAlertCount alias |
| `windowToCutoff` | 5 | 24h/7d/30d 정확 cutoff, 'live'=null, 기본 now |
| `resolveDomainEventTypes` | 6 | 4개 도메인 매핑, all=null, **도메인 간 중복 0건** |
| `aggregateAlertRowsByProvince` (D14) | 5 | 빈 입력 9시도 0건, 정확 집계, 해외/미분류 제외, 9시도 모두 포함, 천단위 콤마 |
| Widget presets (D3) | 6 | 메인 4개 등록, **AI 브리핑 = 메인 동일 opts (878=874 통일)**, ackedFilter=false 표준, domain 필터 정확 |

전체 메트릭+알림 서비스 unit test: **116/116 통과** (fertility 24 + herd 21 + alert 30 + breeding 16 + report 25).

---

## 4. Step 3 — 호출처 교체 (3개 우선 사이트)

### 교체 완료

| # | 파일 | 함수 | Before | After |
|---|---|---|---|---|
| **A1** | `unified-dashboard.routes.ts:queryHerdOverview` | 메인 대시보드 KPI (HerdOverviewCards) | 인라인 `count() from smaxtecEvents WHERE 24h AND !acked` | `getAlertCountForWidget('main_24h_alerts'/'main_health_issues', farmScope)` |
| **A2** | `unified-dashboard.routes.ts:buildAiBriefing` | AI 일일 브리핑 (`total24h`) | 인라인 `count() from smaxtecEvents WHERE 24h` (**acked 필터 없음** → 874 원인) | `getAlertCountForWidget('ai_briefing_24h', farmScope)` (A1과 동일 preset) |
| **A3** | `regional.routes.ts:/map` | 마커별 `activeAlerts` (클라이언트 reduce로 user-visible agg) | 인라인 `count() groupBy farmId` mode 별 7d | `aggregateAlertsByFarm({window:'24h', ackedFilter:false})` |

### 잔존 사이트 (다음 sweep / BUG-007 Part 3 또는 별도 PR)

본 PR 범위 외, 사용자 미검증 영역:

| 파일 | 사이트 | 패턴 / 비고 |
|---|---|---|
| `dashboard.routes.ts` ×4 | farmer/vet/master scope의 `healthEventCount`, `todayEventCount` 등 | 7-day window — alert-aggregator로 통합 가능 |
| `profile-builder.ts` ×3 | farm·regional·tenant `activeAlerts` 누적 | `aggregateAlertsByFarm` 호출로 통일 가능 |
| `tool-executor.ts` ×2 | AI 도구 `alertsLast24h` (`query_farm_summary`, `get_farm_kpis`) | `getActiveAlerts({farmIds:[farmId]})` 호출로 통일 |
| `early-detection.routes.ts:61` | farm별 alertCount | 동일 패턴 |
| `public-stats.routes.ts:83` | `todayAlerts` (24h, 공개) | `getActiveAlerts()` 호출로 통일 (acked 정책 검토) |
| `quarantine-dashboard.service.ts` `fetchActiveAlerts` | **list 반환 패턴** (단순 count 아님) | aggregator의 `getActiveAlerts()`로 count만 통일은 가능하나 list 자체는 별도 처리 필요 |
| `epidemic-intelligence.routes.ts:341/348/350` | 발열률·이상개체율 (count/headCount 비율) | herd-service + alert-aggregator 조합 사용 검토 |
| `services/report/dataCollector.ts:149` | 리포트용 alertCount | 단순 통합 가능 |

→ Phase 2 (BUG-007 Part 3) 또는 별도 sweep에서 처리. 본 PR은 priority 4 사이트 핵심만.

---

## 5. 단방향 흐름 (D3 명문화)

```
[fever-detector]  [rumination-drop]  [lameness]  [clinical]  [pregnancy-check]  [calving-detection]
       │                  │                │            │              │                     │
       └──────────────────┴────────────────┴────────────┴──────────────┴─────────────────────┘
                                              │
                                              │ raw 알림 publish → smaxtecEvents 테이블
                                              ▼
                          ┌─────────────────────────────────────┐
                          │  alert-aggregator.ts                │
                          │  - getActiveAlerts(opts)            │
                          │  - aggregateAlertsByDomain(opts)    │
                          │  - aggregateAlertsByFarm(opts)      │
                          │  - aggregateAlertsByProvince(opts)  │
                          │  - getAlertCountForWidget(id)       │
                          └─────────────────────────────────────┘
                                              │
                                              │ 1회 호출
                                              ▼
                                    [UI / route / AI 도구]
```

UI/route는 도메인 서비스를 직접 호출하지 않는다. aggregator만 경유.

---

## 6. 검증 가능 시점 (지난 회차 교훈)

| 변경 | 검증 환경 | 시점 |
|---|---|---|
| **Frontend 변경** (UI 컴포넌트, hook, 페이지) | Netlify deploy preview (PR push 직후) | 즉시 |
| **Backend 변경** (server services/routes) | Railway production (main 머지 후 자동 배포) | **머지 후 3-5분** |

**본 PR은 backend-only**. 따라서 deploy preview에서 frontend 호출은 production Railway (옛 코드)로 proxy되어 ❌ **머지 전 검증 불가능**.

→ 검증 절차:
1. PR review (코드 + audit 문서)
2. 머지 → Railway 자동 빌드
3. cowtalk.netlify.app에서 메인 대시보드 + AI 브리핑 두 카운터 비교 (동일 값 확인)
4. /regional-map 활성 알림 / 마커 reduce 합 확인

---

## 7. 검증 기대값

머지 후 cowtalk.netlify.app에서:

| 위치 | 표시값 기대 | 검증 방법 |
|---|---|---|
| 메인 대시보드 "24H 알림" KPI | N건 (24h, !acked) | 화면 |
| AI 일일 브리핑 "오늘 N건 알림" | **동일 N건** (이전 878 vs 874 차이 0) | 메인과 비교 |
| 메인 대시보드 "건강 이상" KPI | health 도메인 24h !acked | 화면 |
| /regional-map 활성 알림 KPI | 마커 activeAlerts 합 (24h !acked) | 클라이언트 reduce |
| /regional-map 개별 마커 호버 | 농장별 24h !acked | 호버 툴팁 |

차이 발견 시 즉시 보고. 코드 정확성은 unit test로 검증됨; 실 데이터 정합성은 시연 환경 회귀.
