# CowTalk CTO Handoff

> 새 세션 CTO(또는 새 LLM 페어) 즉시 복귀용 단일 문서. 이 문서만 읽으면 현재 단계 파악 + 다음 박스 작성 가능.

| | |
|---|---|
| 갱신 | 2026-05-16 |
| 다음 시연 | **2026-06-04** (D-19) |
| 진행 단계 | Phase 1 / BUG-001 통합 머지 준비 |
| 활성 PR | [#33 통합 BUG-001](https://github.com/hhj3150/cowtalk/pull/33) (base=`claude/xenodochial-lewin-2906ef`, main 통합 권고됨) |
| 활성 PR (참고) | [#32 113.1% root cause](https://github.com/hhj3150/cowtalk/pull/32) — PR #33에 통합 예정 |

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

## 2. 완성 정의 (Definition of Done) — 6/4 시연 기준

다음 두 조건이 동시에 충족된 상태:

- **(A) 시연 30분 동안 데이터 모순 0건** — 같은 농장·같은 시점이면 모든 화면이 같은 숫자.
- **(B) 5단계 시연 시나리오 끊김 없이 작동** — 본문은 사용자가 별도 결정 대기 중.

"기능 완성"이 아니라 위 두 조건이 정의. 매 PR이 이 둘에 기여하는지 자문.

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

### Phase 2 — 역할 분리 (미착수)
L1/L2/L3 사용자별 다른 화면. 권한 게이팅 통일 UI 아님.

### Phase 3 — L3 핵심 기능 (미착수)
방역 군집 감지 (cluster thresholds TBD), 전국 vs 시도 합계 일관성 검증 잡, 정책 시뮬레이션.

### Phase 4 — 시연 준비 (미착수)
5단계 시나리오 본문 확정 → 시나리오별 화면 동선 가드 → E2E 테스트.

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

- **BUG-007 owner**: TBD (alert-aggregator 신설 시 지정).
- **L3 cluster detection thresholds** ([metrics-contract.md §16](metrics-contract.md)): 군집 거리·시간 윈도우·발열/호흡기 임계, 위험스코어 컷오프, 시도 vs 전국 합계 허용 오차 — 모두 TBD. 시나리오 5단계 확정 후 결정 라운드.
- **시연 5단계 시나리오 본문**: 등장 페르소나(L1/L2/L3), 등장 화면, 클릭 순서 — 사용자 결정 대기.
- **6/4 시연 master/role 전환 여부**: 시연에서 권한 전환을 보여줄지, 단일 master 권한으로만 갈지 — 사용자 결정 대기.
- **수태율 측정 후 회귀 결과**: D2 위반 수정으로 CR이 어떻게 변하는지 (60–85% 정상, 90%↑ stop condition) — cowtalk.netlify.app preview 환경에서 사용자 수동 측정 후 [bug-001-audit.md §8](bug-001-audit.md) 표 채우기.

---

## 9. 활성 PR 상태

### PR #33 ([URL](https://github.com/hhj3150/cowtalk/pull/33))
- 브랜치: `claude/bug-001-cr-single-source`
- 베이스: `claude/xenodochial-lewin-2906ef` (PR #32) → **main으로 변경 권고** (Part 2 §10 참조)
- 포함 commit:
  - `87ddd79` BUG-001 단일 owner 통합 (10 사이트 → fertility-service)
  - `dcf08ac` D5 displayValue/status 추가 + UI 4파일 가드
  - 본 commit (예정): 잔존 D5 2곳 처리 (chart filter, gauge null) + handoff.md
- 검증:
  - tsc server/shared/web: EXIT=0 ✅
  - vitest fertility-service.test.ts: 24/24 통과 ✅
  - 수동 회귀: [bug-001-audit.md §10](bug-001-audit.md) 사용자 검증 대기

### PR #32 ([URL](https://github.com/hhj3150/cowtalk/pull/32))
- 브랜치: `claude/xenodochial-lewin-2906ef`
- 베이스: `main`
- 단일 commit: `d068c4d` (4 files, +75/-129)
- 상태: OPEN. PR #33 통합 머지 시 자동 종결 권고.

---

## 10. 머지 옵션 권고

세 옵션 검토:

| 옵션 | 절차 | 검증 횟수 | 리스크 |
|---|---|---|---|
| (A) PR #32 먼저 main 머지 → PR #33 자동 retarget → preview 검증 → 머지 | 순차 2단계 | 2회 (각 PR 마다) | 단계 사이에 main이 잠시 PR #32만 적용된 상태로 노출. 시연 환경에서 D5 가드 없는 상태가 짧게라도 보일 수 있음. |
| **(B) PR #33 base를 main으로 변경 → PR #32 close → 통합 PR로 단일 검증 후 머지** | 1단계 | 1회 | **권고**. PR #33 diff에 PR #32 변경이 자동 포함. Git lineage 보존. PR #32 commit hash는 PR #33 chain에 그대로 존재. |
| (C) 새 통합 PR 생성 → PR #32 + #33 둘 다 close → 새 PR 검증 후 머지 | 1단계 + 신규 PR | 1회 | (B)와 효과 동일이나 PR 번호 증가. 추적 가치 없음. |

**→ 옵션 (B) 권고.** 이유: GitHub은 PR base 변경 시 diff를 자동 재계산. `claude/bug-001-cr-single-source` 브랜치는 이미 PR #32의 commit (`d068c4d`)을 포함하므로, base를 main으로 바꾸면 PR #33 diff에 PR #32 변경이 합쳐짐. 검증 1회, 시연 환경 노출 단일 시점. PR #32는 마무리 코멘트("PR #33에 통합") 후 close.

---

## 11. 복귀 프로토콜

새 세션이 시작되면:

1. 이 문서를 먼저 읽는다.
2. §6 Phase/BUG 표에서 현재 단계 확인. 활성 BUG의 PR 링크 follow.
3. §3 보존 자산 + §4 절대 금지 숙지.
4. §7 Decision Log + §8 미해결로 결정 컨텍스트 복귀.
5. §10 머지 옵션 + audit doc §10 회귀 체크리스트 상태 확인.
6. 사용자가 다음 박스를 발행할 때까지 대기 — **선제적 코드 변경 금지**.

다음 박스 작성 시 (외부 LLM이 사용자에게 제안할 때):
- D6 다음 순서: **BUG-007** (alert-aggregator)
- 박스 구조: 컨텍스트 1단락 + Part 1~N 작업 + 산출물 + 절대 금지 + 중단 조건
- Claude Code가 매 응답에 paste-ready 요약을 넘기므로 그것을 다음 박스 입력으로 사용.

---

## 12. 핵심 파일 위치

| 항목 | 경로 |
|---|---|
| 메트릭 단일 진실 | [docs/metrics-contract.md](metrics-contract.md) |
| BUG-001 감사 | [docs/bug-001-audit.md](bug-001-audit.md) |
| 수태율 owner | [packages/server/src/services/metrics/fertility-service.ts](../packages/server/src/services/metrics/fertility-service.ts) |
| 백분율 헬퍼 | [packages/server/src/lib/metrics-clamp.ts](../packages/server/src/lib/metrics-clamp.ts) |
| 본 handoff 문서 | docs/cto-handoff.md (이 파일) |
| 외부 메모리 인덱스 | `~/.claude/projects/.../memory/MEMORY.md` |
