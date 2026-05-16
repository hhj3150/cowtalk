# CowTalk CTO Handoff

> 새 세션 CTO(또는 새 LLM 페어) 즉시 복귀용 단일 문서. 이 문서만 읽으면 현재 단계 파악 + 다음 박스 작성 가능.

| | |
|---|---|
| 갱신 | 2026-05-16 (v0.3) |
| 목표 | **카우톡 v5.0 완성** (시연 일정 없음, 품질 우선) |
| 진행 단계 | Phase 1 / BUG-007 진입 |
| 최근 머지 | [#33 BUG-001 통합](https://github.com/hhj3150/cowtalk/pull/33) (`6c2d886`, 2026-05-16) |
| 정리 대기 | [#32](https://github.com/hhj3150/cowtalk/pull/32) — PR #33에 통합 완료, close 필요 (운영 정리) |

---

## 1. CowTalk 지향점

CowTalk은 **AI 결합 국가 축산 통합 관리 시스템**이며, 3계층 위계 데이터 플랫폼이다.

```
LAYER 3 — AI 국가 축산관리 (지자체·광역·국가) ← 핵심 가치, 영업 차별점 본진
LAYER 2 — 수의사 통합 관리 (담당 N개 농장 + 개별 진입)
LAYER 1 — 목장 단위 관리 (농장주, 데이터 원천)
```

- 서로 다른 사용자가 서로 다른 화면. 수의사는 L1↔L2 자유 이동.
- 위로 갈수록 AI 가치 기하급수적. 1농장 발열=알람, 100농장 패턴=국가 방역 의사결정.
- L1·L2는 L3를 위한 데이터 공급망. L1 농장주 UX는 데이터 흐름 유지에 충분한 수준이면 됨.

상세: [memory/project_three_layer_architecture.md](../.claude/projects/-Users-jamesha-Desktop-D2O-2025------EcoBit-cowtalk-v5/memory/project_three_layer_architecture.md) (외부 메모리).

---

## 2. 완성 정의 (Definition of Done)

다음 조건이 모두 충족된 상태:

- **L1 농장주가 자기 농장 데이터로 매일의 의사결정(번식·건강·도태)을 실제로 내릴 수 있음**
- **L2 수의사가 담당 농장 통합 모니터링 + 위험 농장 식별 + 처치 결정 가능**
- **L3 행정/방역이 광역 데이터로 정책 결정(방역 구역 설정, 수급 예측, 보조금 배분 근거)을 내릴 수 있음**
- **모든 레이어에서 데이터 모순 0건**
- **시연 일정 없음, 품질 우선**

"기능 완성"이 아니라 위 5가지 조건이 정의. 매 PR이 이들에 기여하는지 자문.

자체 검증 자산:
- **5단계 데모 시나리오** (카우톡 자체 검증 목적, 시연 일정과 분리). 시나리오 본문은 사용자 결정 대기.

---

## 3. 보존 자산 (절대 깨지 않을 것)

- **`fertility-service.ts`** — 수태율(CR) 단일 owner (D1). 11 사이트가 여기를 호출. 인라인 CR 계산 금지.
- **`pregnancyRate = EDR × CR ÷ 100`** — 업계 표준 합성 공식. CR이 null이면 PR도 null (D5 propagation).
- **`clampPct` / `ratioPct`** (PR #32) — 모든 백분율은 이 헬퍼 경유. 음수·>100% 발생 불가능.
- **`metrics-contract.md` v0.2** — 단일 진실 공급원. 코드보다 먼저 갱신.
- **`/breeding` 액션 카드 UI** — 사용자 명시적 보존 지정.
- **`/epidemiology/dashboard`** — 사용자 명시적 보존 지정.
- **수의사 AI 추천 텍스트** — `vet-action-plans.ts`, 시스템 프롬프트 본문. null 가드 외 변경 금지.
- **PR #32 mock 제거** — `Math.random()`이 production 경로에 다시 들어오지 못함.

---

## 4. 절대 금지

- ❌ UI 스타일/레이아웃/색상/폰트/간격 변경 (다크모드 테마, 컴포넌트 spacing 등)
- ❌ 한 PR에서 여러 BUG 동시 처리
- ❌ 거짓 수치 (Math.random, hardcoded fallback `: 45` 등 production 경로 노출)
- ❌ % 표기 일괄 변환 (D4. BUG-005 전용)
- ❌ /breeding 액션카드, /epidemiology/dashboard, 수의사 AI 추천 텍스트 직접 수정
- ❌ 메모리·docs 갱신 없이 코드만 변경

---

## 5. 워크플로우

```
사용자 (하원장님)
   │
   │ ① "박스" 명령 발행 (3계층 framing + 5 Part 구조)
   ▼
CTO (외부 LLM, ChatGPT/Claude 확장자)
   │
   │ ② 박스 다듬어서 Claude Code에 전달
   ▼
Claude Code (현재 turn)
   │
   │ ③ 작업 + commit + push + audit doc 갱신
   │ ④ "📋 외부 LLM 전달용" 요약 블록 반환
   ▼
CTO ──→ ⑤ 다음 박스 발행
```

매 응답 끝에 **"📋 외부 LLM 전달용 — 현재 진행사항"** 코드블록 첨부 ([memory/feedback_paste_ready_summary.md](../.claude/projects/-Users-jamesha-Desktop-D2O-2025------EcoBit-cowtalk-v5/memory/feedback_paste_ready_summary.md)).

---

## 6. Phase / BUG 진행 현황

### Phase 1 — 데이터 무결성 (진행 중)

| BUG | 제목 | 상태 | PR / 위치 |
|---|---|---|---|
| **001** | 수태율(CR) 단일 owner 통합 + 113.1% 근본 원인 + production mock 제거 + D5 전파 | **✅ 코드 완료, 통합 PR 머지 대기** | [#33](https://github.com/hhj3150/cowtalk/pull/33) + [#32](https://github.com/hhj3150/cowtalk/pull/32) |
| **007** | 알림 카운트 단일 owner (`alert-aggregator.ts` 신설) | ⬜ 대기 | — |
| **006** | DIM 자동 상태 전이 (lactating→dry_off→cull_review) | ⬜ 대기 | — |
| **008** | `unhandledRate` 위치 확정 + clamp | ⬜ 대기 | — |
| **005** | % → 0.00 표기 변환 (D4) — AI 정확도 농장주 화면 격리 포함 | ⬜ 대기 (BUG-001에서 일부 처리됨) | — |

수정 순서 (D6): **001 → 007 → 006 → 008 → 005**. 평행 진행 금지.

---

## 6.5 권한 모델 현황 (중요 — 오해 방지)

> 새 세션 CTO·Claude Code가 권한 관련 "버그"를 발견했다고 잘못 진단하지 않도록 명문화. 이 섹션을 먼저 읽지 않고 권한 코드를 수정하지 말 것.

### 현재 상태

- 하원장님(하현제) 계정 = **master**.
- master는 197개 농장(7143두) 통합 조회 권한 보유 — **정상 동작**.
- 농장주·수의사·방역관·행정관 개별 ID는 **아직 발급 전**.
- 현재 UI의 "농장주 / 수의사 / 방역관" 역할 전환은 **UI 시뮬레이션** 단계. 실제 데이터 격리는 미구현.

### 향후 작업 (Phase 2 = 권한 격리 인프라)

1. 데이터 모델: `ownerId` / `farmId` 기반 row-level 필터링 정책.
2. API 레이어: 요청자 권한 기반 자동 필터링 (master는 우회, 전체 조회).
3. 수의사 다중 농장 매핑: `vet_farm_assignment` 테이블 (담당 농장 N개).
4. L3 광역 필터: 시군구 / 도 / 국가 단위 필터.
5. 농장주 ID 발급 = **운영 단계 시작 시점**. 인프라 완성 후 발급 즉시 데이터 격리 자동 작동.
6. master 계정은 운영 단계에도 전체 조회 권한 유지.

### 오해 방지 체크리스트 — 새 세션 진입 시 확인

| 관찰된 현상 | 잘못된 진단 (피할 것) | 올바른 인식 |
|---|---|---|
| "농장주 역할로 로그인했는데 197개 농장 다 보임" | "권한 버그" → 즉시 fix 시도 ❌ | **master 시뮬레이션 정상**. Phase 2 인프라 미완. |
| "역할 전환 메뉴를 눌렀는데 데이터 같음" | "역할 전환 안 됨 버그" → 즉시 fix 시도 ❌ | UI 라벨만 전환되는 단계. 데이터 격리는 Phase 2. |
| "수의사 화면에서 다른 농장 데이터가 보임" | "권한 격리 누락" → 즉시 fix 시도 ❌ | 현재 master 계정 + UI 시뮬레이션 단계. Phase 2 작업. |
| "방역관 ID로 시연하고 싶다" | 즉시 ID 발급 시도 ❌ | 인프라 우선. ID 발급은 인프라 완성 후. |

### 핵심 원칙

- **권한 격리는 인프라 우선, UI는 나중.** 어떤 UI 분기로 권한 흉내내는 코드도 즉흥적으로 추가하지 말 것.
- **master 계정 자체는 항상 유지** — 운영 단계에도 전체 조회 권한.

### Phase 2 — 역할 분리 (미착수)
L1/L2/L3 사용자별 다른 화면. 권한 게이팅 통일 UI 아님. **현재 권한 모델 상태는 §6.5 참조** — 새 세션 진입 시 반드시 먼저 읽을 것.

### Phase 3 — L3 핵심 기능 (미착수)
방역 군집 감지 (cluster thresholds TBD), 전국 vs 시도 합계 일관성 검증 잡, 정책 시뮬레이션.

### Phase 4 — 자체 검증 시나리오 (미착수)
5단계 데모 시나리오 본문 확정 → 화면 동선 가드 → E2E 테스트. 시연 일정 분리, 카우톡 자체 품질 검증 자산.

---

## 7. 결정사항 — Decision Log (D1–D6, 2026-05-16)

| # | 항목 | 결정 |
|---|------|------|
| **D1** | 수태율 공식 단일 소스 | `packages/server/src/services/metrics/fertility-service.ts`. 인라인 계산 금지. |
| **D2** | "결정난(decided)" 정의 | 임신확정 + 공태확정 only. **pending 분모에서 제외.** smaXtec은 `details.pregnant === true ∥ false`만 결정. |
| **D3** | 알림 카운트 owner | 신규 `services/alerts/alert-aggregator.ts` (BUG-007에서 구현). 라우트는 1회 호출. |
| **D4** | AI confidence 표기 | 내부 0–1 float, UI도 "신뢰도 0.87" (소수 둘째 자리). % 표기 금지. 본 PR 비포함, BUG-005에서. |
| **D5** | 빈 농장 KPI 표시 | "—" (em dash). "0", "N/A", "정상 운영" 금지. 라벨 필요 시 "데이터 부족". |
| **D6** | 버그 수정 순서 | BUG-001 → 007 → 006 → 008 → 005. 한 PR=한 BUG. |

상세: [metrics-contract.md §0 Decision Log](metrics-contract.md).

---

## 8. 미해결 (Open Items)

- **BUG-007 owner**: TBD (alert-aggregator 신설 시 지정). 두수 단일 소스도 BUG-007 범위.
- **L3 cluster detection thresholds** ([metrics-contract.md §16](metrics-contract.md)): 군집 거리·시간 윈도우·발열/호흡기 임계, 위험스코어 컷오프, 시도 vs 전국 합계 허용 오차 — 모두 TBD. 자체 검증 시나리오 확정 후 결정 라운드.
- **5단계 데모 시나리오 본문**: 등장 페르소나(L1/L2/L3), 등장 화면, 클릭 순서 — 사용자 결정 대기. (시연 일정 분리, 자체 검증 자산)
- **수태율 측정 후 회귀 결과**: D2 위반 수정으로 CR이 어떻게 변하는지 (60–85% 정상, 90%↑ stop condition) — cowtalk.netlify.app preview 환경에서 사용자 수동 측정 후 [bug-001-audit.md §8](bug-001-audit.md) 표 채우기.

---

## 9. PR 이력

### PR #33 — **MERGED** (`6c2d886`, 2026-05-16)
- 제목: "BUG-001: 수태율 단일 소스 + 113.1% 근본 원인 + production mock 제거 + D5 전파"
- 머지 방식: PR #32 변경분 통합(옵션 B 적용) → 단일 PR로 main 머지
- 산출물: `fertility-service.ts`, `metrics-clamp.ts`, `metrics-contract.md` v0.2, `bug-001-audit.md`, `cto-handoff.md` 초안

### PR #32 — OPEN (실효성 없음, close 대기)
- PR #33이 옵션 B로 PR #32 변경분(`d068c4d`)을 흡수하여 main 머지됨.
- 정리: 사용자가 마무리 코멘트("PR #33에 통합됨") 후 close 권고.

---

## 10. 복귀 프로토콜

새 세션이 시작되면:

1. 이 문서를 먼저 읽는다.
2. §6 Phase/BUG 표에서 현재 단계 확인. 활성 BUG의 PR 링크 follow.
3. **§6.5 권한 모델 현황** — master 시뮬레이션 오해 방지 필수 숙지.
4. §3 보존 자산 + §4 절대 금지 숙지.
5. §7 Decision Log + §8 미해결로 결정 컨텍스트 복귀.
6. §9 PR 이력 + 활성 audit doc 회귀 체크리스트 확인.
7. 사용자가 다음 박스를 발행할 때까지 대기 — **선제적 코드 변경 금지**.

다음 박스 작성 시 (외부 LLM이 사용자에게 제안할 때):
- D6 다음 순서: **BUG-007** (두수 단일 소스 + alert-aggregator 신설)
- 박스 구조: 컨텍스트 1단락 + Part 1~N 작업 + 산출물 + 절대 금지 + 중단 조건
- Claude Code가 매 응답에 paste-ready 요약을 넘기므로 그것을 다음 박스 입력으로 사용.

---

## 11. 핵심 파일 위치

| 항목 | 경로 |
|---|---|
| 메트릭 단일 진실 | [docs/metrics-contract.md](metrics-contract.md) |
| BUG-001 감사 | [docs/bug-001-audit.md](bug-001-audit.md) |
| BUG-007 감사 | [docs/bug-007-audit.md](bug-007-audit.md) (작성 중) |
| 수태율 owner | [packages/server/src/services/metrics/fertility-service.ts](../packages/server/src/services/metrics/fertility-service.ts) |
| 두수 owner | (BUG-007 Step 2에서 신설 예정) — `packages/server/src/services/metrics/herd-service.ts` |
| 알림 카운트 owner | (BUG-007 D3에서 신설 예정) — `packages/server/src/services/alerts/alert-aggregator.ts` |
| 백분율 헬퍼 | [packages/server/src/lib/metrics-clamp.ts](../packages/server/src/lib/metrics-clamp.ts) |
| 본 handoff 문서 | docs/cto-handoff.md (이 파일) |
| 외부 메모리 인덱스 | `~/.claude/projects/.../memory/MEMORY.md` |

---

## 12. Change Log

| 버전 | 일자 | 변경 |
|---|---|---|
| v0.1 | 2026-05-16 | 초안 |
| v0.2 | 2026-05-16 | §6.5 권한 모델 현황 추가 (master 시뮬레이션 오해 방지) |
| **v0.3** | **2026-05-16** | **완성 정의에서 시연 컨텍스트 제거, 품질 기준 5-bullet으로 전환. "D-19", "6/4", "6월 4일", "정부 시연" 표현 제거. BUG-001 머지 완료 반영. BUG-007 진입 (두수 단일 소스 + alert-aggregator).** |
