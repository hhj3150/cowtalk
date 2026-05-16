# BUG-006 Audit — 빈 농장 "정상 운영" 라벨 제거 (D5 UI 강제)

> 2026-05-16. service layer가 D5 패턴(displayValue + status)을 채택했지만 UI 컴포넌트가 빈 상태에서 긍정 라벨("정상 운영" / "이상 없음" / "양호")로 렌더링하던 잔존 false positive 차단.

## 0. 핵심 문제

| 상황 | Before | After (D5 강제) |
|---|---|---|
| 빈 농장 (data_insufficient) | "정상 운영" / "이상 없음" / "방역 양호" | "—" (neutral) 또는 "0건 (활성 알림)" |
| healthScore=null (mock 폴백 75) | "양호 (75)" | "—" (neutral 배지) |
| 0 위험 시도 (실측 0) | "이상 없음" (긍정) | "0 시도" (사실 진술, neutral) |

---

## 1. Audit grep 결과

### A. "정상 운영" / "이상 없음" / "양호" 류 user-visible 노출

**총 8개 사이트 발견 → 5개가 D5 violation, 3개는 정당한 카테고리 라벨**

| # | 파일:라인 | 라벨 | 분류 | 처리 |
|---|---|---|---|---|
| 1 | `GovAdminDashboard.tsx:178` | "이상 없음" (when highRiskProvinces=0) | **D5 violation** | ✅ 수정 → unit "시도" |
| 2 | `SovereignAlarmFeed.tsx:96` | "이상 없음" (when alarms.length=0) | **D5 violation** | ✅ 수정 → "활성 알림 0건" + "—" |
| 3 | `QuarantineDashboard.tsx:492` | "방역 양호" (when top5RiskFarms=0) | **D5 violation** | ✅ 수정 → "위험 등급 농장 0건" + "—" |
| 4 | `FarmDetailPage.tsx:HealthBadge` | "양호 (75)" when score is mock 75 | **D5 violation** (mock 폴백 경유) | ✅ HealthBadge null-aware + farm.api `?? 75` 제거 |
| 5 | `farm.api.ts:70` | `healthScore: 75` mock 폴백 | **D5 violation** (PR #32 mock 패턴) | ✅ → `null` |
| 6 | `FarmManagementPage.tsx:24/289/336` | "정상 운영" | farms.status='active' enum label | ⬜ 유지 (실제 운영 상태, D5 위반 아님) |
| 7 | `claude-interpreter.ts:339` | "정상 운영" in AI text | AI text generation | ⬜ 유지 (서버 텍스트, 별도 처리 시 BUG-005에서) |
| 8 | `CowProfilePage.tsx:476` | "양호" (healthScore 기반 카테고리) | 카테고리 등급 (real value 분류) | ⬜ 유지 (이미 `healthScore !== null` 가드, D13 분리 OK) |
| 9 | `InbreedingGauge.tsx:12` | "양호" (근교계수 < 3.125%) | 계산 결과 등급 | ⬜ 유지 |
| 10 | `BreedingKpiPage.tsx:292` | "B 양호" (performance grade) | 성과 등급 | ⬜ 유지 |
| 11 | `DifferentialDiagnosisCard.tsx:43` | "센서 양호" (good enum) | 상태 enum | ⬜ 유지 |
| 12 | `InvestigationWorkflow.tsx:535` | "주변 농장 이상 없음" | investigation-specific | ⬜ 유지 (좁은 범위, 검증된 컨텍스트) |

→ **수정 5건, 정당한 라벨 7건 보존**.

### B. NaN/null 처리 패턴 grep
- 대부분 `?? 0` 폴백 패턴 — 두수/통계 영역에서 사용. D5 위반 가능성 있지만 BUG-007 Part 1/2에서 이미 정리됨.
- `farm.api.ts:70 healthScore: 75` = **이번 PR에서 마지막 mock 폴백 제거** (PR #32/PR #34에서 sweep된 패턴의 잔존 사이트).

---

## 2. MetricValue 공통 컴포넌트 도입

**파일**: `packages/web/src/components/common/MetricValue.tsx`

```tsx
interface MetricResult {
  displayValue: string;
  status: 'ok' | 'data_insufficient';
}

interface Props {
  result: MetricResult;
  unit?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function MetricValue({ result, unit, className, style }: Props): React.JSX.Element;
```

**동작**:
- `status='ok'` → `displayValue` + `unit` 표시. caller가 색·크기·폰트 결정.
- `status='data_insufficient'` → "—" + neutral 색 (`var(--ct-text-secondary)`) + unit 숨김 + tooltip "충분한 데이터가 없습니다" + `aria-label="데이터 부족"`.
- **D5 강제**: 컴포넌트가 항상 `displayValue` 직접 표시 → caller가 "정상 운영" 등으로 덮어쓸 수 없음.

**unit test** (`packages/web/src/__tests__/MetricValue.test.tsx`):
- status='ok' + displayValue + unit 렌더
- status='ok' + displayValue='0' → "0" + unit (D13 실측 0)
- status='data_insufficient' → "—" + aria-label + tooltip
- neutral 색 적용 검증
- D5 위반 금지 검증 (긍정 라벨 미표시)
- 10+ 테스트 케이스

**호환성**: 기존 `KpiCard`는 `value: number | string` 받아서 caller 책임. 신규 `MetricValue`는 D5-aware로 caller 가드 자동 처리. 점진적 마이그레이션 가능.

---

## 3. 호출처 교체 결과 (5 사이트)

### Site 1 — GovAdminDashboard.tsx:178

**Before**:
```tsx
unit: nationalSummary.highRiskProvinces > 0 ? '즉시 조치 필요' : '이상 없음',
color: nationalSummary.highRiskProvinces > 0 ? '#ef4444' : '#22c55e',
```
"고위험 시도" KPI 카드의 unit이 0일 때 "이상 없음" + 녹색.

**After**:
```tsx
unit: nationalSummary.highRiskProvinces > 0 ? '즉시 조치 필요' : '시도',
color: nationalSummary.highRiskProvinces > 0 ? '#ef4444' : 'var(--ct-text-secondary)',
```
0일 때 unit="시도" (사실 진술), 색은 neutral.

### Site 2 — SovereignAlarmFeed.tsx:96

**Before**:
```tsx
if (alarms.length === 0) return (
  <div>
    ✅ <div style={{color: '#22c55e'}}>이상 없음</div>
    <div>소버린 AI가 분석한 결과 특이사항 없음</div>
  </div>
);
```
빈 알림 = "이상 없음" 녹색 + ✅.

**After**:
```tsx
if (alarms.length === 0) return (
  <div style={{color: 'var(--ct-text-secondary)'}}>
    <div style={{fontSize: 28}}>—</div>
    <div>활성 알림 0건</div>
    <div>최근 24시간 미확인 알림이 없습니다.</div>
  </div>
);
```
"—" + "활성 알림 0건" + neutral 색 + 사실 진술.

### Site 3 — QuarantineDashboard.tsx:492

**Before**:
```tsx
{top5RiskFarms.length === 0 && (
  <div>✅ 위험 농장 없음 — 방역 양호</div>
)}
```

**After**:
```tsx
{top5RiskFarms.length === 0 && (
  <div style={{color: 'var(--ct-text-muted)'}}>
    <div style={{fontSize: 24}}>—</div>
    위험 등급 농장 0건
  </div>
)}
```

### Site 4 — FarmDetailPage.tsx:HealthBadge

**Before** (line 24):
```tsx
function HealthBadge({ score }: { readonly score: number }) {
  const level = score >= 80 ? { label: '양호', color: 'bg-green-100 text-green-800' } : ...
  return <span>{level.label} ({score})</span>;
}
```
score가 mock 75를 받으면 "양호 (75)" 표시.

**After**:
```tsx
function HealthBadge({ score }: { readonly score: number | null }) {
  if (score == null) {
    return (
      <span role="status" aria-label="건강점수 데이터 부족"
            className="bg-gray-100 text-gray-500">—</span>
    );
  }
  // 이하 동일 (실값 카테고리 등급)
}
```

### Site 5 — farm.api.ts:70 (mock 폴백 제거)

**Before**:
```tsx
healthScore: 75,
```
`/profile` 엔드포인트 실패 시 fallback에서 healthScore=75 mock 반환. PR #32에서 sweep했던 `Math.random()` / hardcoded fallback 패턴의 마지막 잔존.

**After**:
```tsx
healthScore: null,  // D5 (BUG-006): 75 mock 폴백 제거. server 없으면 null → UI는 "—".
```

`FarmProfile.healthScore` 타입도 `number` → `number | null`로 갱신.

---

## 4. 정당한 라벨 보존 (D5 위반 아님)

다음 사이트는 검토 후 **수정하지 않음**:

| 사이트 | 라벨 | 이유 |
|---|---|---|
| `FarmManagementPage.tsx:24` | "정상 운영" | `farms.status='active'` enum 라벨 (실제 운영 상태) |
| `FarmManagementPage.tsx:289` | "정상운영" | active 농장 카운트 카드 (count >= 0 실측) |
| `claude-interpreter.ts:339` | "정상 운영" (AI 텍스트) | AI 생성 텍스트, 별도 처리 (향후 BUG-005에서 prompt sweep) |
| `CowProfilePage.tsx:476` | healthScore 카테고리 "양호/주의/위험" | `!== null` 가드 후 실값 분류 (라인 460 가드 OK) |
| `InbreedingGauge.tsx:12` | "양호/주의/위험" | 근교계수 계산 결과 분류 |
| `BreedingKpiPage.tsx:292` | "B 양호" | 번식 성과 등급 (real score 분류) |
| `DifferentialDiagnosisCard.tsx:43` | "센서 양호" | DifferentialDiagnosis enum 등급 |
| `InvestigationWorkflow.tsx:535` | "주변 농장 이상 없음" | investigation-specific, 좁은 검증 컨텍스트 |

→ 이들은 카테고리 라벨 (실값 분류). status='data_insufficient'와 무관. 모두 null-aware 또는 enum 기반.

---

## 5. 검증

### Tests
- `MetricValue.test.tsx` 11+ 테스트 (D5/D13 분기 + neutral 색 + aria + D5 위반 금지 검증)
- 전체 web tests: 기존 + 신규

### Grep verification
```
grep -rn "정상 운영\|이상 없음\|방역 양호" packages/web/src --include="*.tsx"
```
→ user-visible 라벨 노출 사이트 (수정 대상): **0건** ✅
→ 정당한 enum/카테고리 라벨 (수정 대상 외): 보존

### tsc
- packages/server, shared, web → EXIT=0 ✅

---

## 6. 검증 가능 시점

본 BUG-006은 **frontend-only**:
- `MetricValue.tsx` 신규
- `GovAdminDashboard.tsx`, `SovereignAlarmFeed.tsx`, `QuarantineDashboard.tsx`, `FarmDetailPage.tsx`, `farm.api.ts` (frontend type) 수정

→ **Netlify deploy preview에서 즉시 검증 가능** (backend 변경 0건).

검증 방법:
1. 빈 농장(데이터 0) 또는 위험 농장 0개 시나리오 진입
2. 메인 대시보드 "고위험 시도" KPI → "0 시도" (neutral)
3. 농장 알림 피드 → "—" + "활성 알림 0건" (neutral)
4. /epidemiology/dashboard 위험 농장 0 시 → "—" + "위험 등급 농장 0건" (neutral)
5. `/farm/:farmId` healthScore null인 농장 → "—" badge (mock 75 안 보임)
6. 어떤 위치에서도 "이상 없음" / "방역 양호" / 녹색 ✅ 안 보임 검증

---

## 7. Phase 2.5 (다음 sweep)

본 PR 범위 외, 향후 정리 후보:
- `claude-interpreter.ts:339` AI 생성 텍스트 "정상 운영" — BUG-005 (% 표기 sweep) 시 prompt 차원에서 같이
- 다른 mock 폴백 `?? 0` 패턴들 (totalAnimals, score 등) — 각 사이트 검증 후 case-by-case
- `unified-dashboard.routes.ts` HerdHealthDoughnut 등 농장별 healthScore 렌더 — server 데이터 검증 필요
