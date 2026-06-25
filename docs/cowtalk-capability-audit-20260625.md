# CowTalk 구현 현황 기반 기능 명세서 (코드 감사)

> 목적: 경기도 인수위 브리핑을 **실제 구현된 기능**에 근거하게 만들기 위한 코드 감사 결과.
> 방법: 코드베이스 정밀 감사(파일:라인 증거). 마케팅 주장과 실제 코드를 1:1 대조.
> 분류: ✅ 내재(구현·실DB) / 🟡 부분구현 / 🔴 향후 보강(미구현·미연동)

---

## 0. 한 줄 결론

**브리핑에서 주장한 핵심 기능 대부분이 실제로 구현돼 있고 실DB 기반이다.**
단, 경기도(젖소) 맥락에서 **2가지는 "향후 보강"으로 정직하게 분리**해야 한다:
**① 젖소 정액 추천(현재 한우 전용) ② 감별진단 최종 확률 계산(부분).**

---

## 1. ✅ 내재 기능 — "현재 작동, 자신 있게 시연"

### 1-1. 팅커벨 AI (MCP 도구 23개)
| 검증 항목 | 상태 | 근거 |
|---|---|---|
| 도구 23개 정의 | ✅ | `ai-brain/tools/tool-definitions.ts` (23개 정확) |
| 23개 모두 실행 구현 (stub 0개) | ✅ | `tool-executor.ts` (각 case 실함수) |
| 역할별 접근제어(RBAC) | ✅ | `tool-gateway.ts` ROLE_TOOL_ACCESS (4역할 차등) |
| 감사 로그 자동 기록 | ✅ | `schema.ts` tool_audit_log + writeAuditLog |
| 실시간 스트리밍 | ✅ | `claude-client.ts` messages.stream + TTFT 계측 |
| 프롬프트 캐싱(시스템+도구) | ✅ | `claude-client.ts` cache_control ephemeral |
| 도구 병렬 실행 | ✅ | `claude-client.ts` Promise.all |
| 환각 방지(출처 기록 의무) | ✅ | `chat-service.ts` data_references 강제 |
| 방역 모드 자동 활성화 | ✅ | `context-builder.ts` 40+키워드, 역할별 차등 |
| 음성 입력(Web Speech) + 웨이크워드 | ✅ | `useVoiceInput.ts`·`useWakeWord.ts`·`MicButton.tsx` |
| 음성 답변(TTS) | ✅ | 서버 `audio/tts.service.ts` + OpenAI TTS 설정 |

### 1-2. 방역/역학
| 기능 | 상태 | 근거 |
|---|---|---|
| 3단계 드릴다운 대시보드(전국→시도→농장→개체) | ✅ | `quarantine-dashboard.service.ts`, `national-situation.service.ts` |
| 146농장 실좌표 지도 | ✅ | `NationalMiniMap.tsx` + `getAllMapFarms()` |
| **확산 시뮬레이션 — 진짜 SEIR 미분방정식** | ✅ | `spread-simulator.ts` (R0·잠복기·감염기간, 이동제한 시나리오) |
| 접촉망 추적(실 이동이력 우선) | ✅ | `contact-tracer.ts` (animalTransfers 우선) |
| 역학조사 DB 영속화 + 6항목 자동수집 | ✅ | `investigations` 테이블 + repository CRUD |
| KAHIS 보고(상태관리 draft→submitted) | ✅ | `kahis_reports` 테이블 + service CRUD |
| 좌표→시도 매핑 | ✅ | `province-mapper.ts` 경계박스 |

### 1-3. 번식 AI 루프
| 기능 | 상태 | 근거 |
|---|---|---|
| 6단계 칸반(실DB) | ✅ | `breeding-pipeline.service.ts` |
| 수정 적기 추천(AM-PM 규칙) | ✅ | `breeding-advisor.service.ts` |
| 발정동기화 4종(OVSYNCH/PG/G6G/Double) 일정 자동생성 | ✅ | `sync-protocol.service.ts` |
| 번식 KPI(수태율·공태일·분만간격 등) | ✅ | `breeding-pipeline.service.ts` |

### 1-4. 센서 / 조기감지 / 공공데이터 / 역할
| 기능 | 상태 | 근거 |
|---|---|---|
| 센서 수집(5분, smaXtec Data API) | ✅ | `pipeline/orchestrator.ts` |
| 조기 질병감지 DSI(0~100, ≥70 경보) | ✅ | `earlyDetection/disease-detection.engine.ts` |
| 공공데이터 — 이력제(EKAPE 실연동) | ✅ | `connectors/public-data/traceability.connector.ts` |
| 공공데이터 — 등급판정·경락가격 | ✅ | `grade.connector.ts` |
| 4역할 RBAC(farmer/vet/quarantine/gov) | ✅ | `middleware/rbac.ts` + `shared/constants/roles.ts` |
| 전문가 학습 루프(event_labels/clinical_observations) | ✅ | `record_expert_label` + `chat-learner.ts` |

---

## 2. 🟡 부분 구현 — "되지만 고도화 필요"

| 기능 | 상태 | 비고 |
|---|---|---|
| **감별진단 최종 확률 계산** | 🟡 | 6개 질병 정의·센서근거(✓/✗/—)는 동작. **확률 가중치·치료결과 학습은 미완성**. `differential-diagnosis.service.ts` |
| 역학조사 기상 데이터 | 🟡 | 일부 mock값 → 실 기상 API 연동 필요 |
| 주간 발열 추이(과거분) | 🟡 | 당주만 실데이터, 과거는 추정 → 히스토리 적재 권장 |
| 접촉망(이동이력 없을 때) | 🟡 | 지역 fallback → 실 이동데이터 적재 시 자동 전환 |

---

## 3. 🔴 향후 보강 — "정직하게 로드맵으로"

| 기능 | 상태 | 경기도 영향 |
|---|---|---|
| **젖소 정액(씨수소) 추천** | 🔴 **한우 전용, 젖소 미연동** | **경기도는 젖소 10만두 → 핵심.** `semen.connector.ts`는 농진청 한우 API만. 젖소는 DCIC/젖소개량사업소 별도 연동 필요 |
| 한우 외 종모우(해외 CDCB/CRV 등) | 🔴 | 수출·고도화 단계 |
| 농장식별번호·일부 공공API | 🟡/🔴 | 코드는 있으나 활용신청·키 설정 전제 |

---

## 4. 브리핑 반영 가이드

**자신 있게 "현재 가능"으로 시연/주장:**
방역 대시보드 · SEIR 확산 시뮬 · 역학조사/KAHIS · 접촉망 · 팅커벨(23도구·음성·방역모드) · 번식 칸반/동기화 · 조기감지 DSI · 공공데이터(이력제/등급/경락) · 4역할 RBAC · 전문가 학습루프

**"향후 보강(로드맵)"으로 분리해 정직하게:**
🔴 젖소 정액 추천(경기 젖소 핵심) · 🟡 감별진단 확률 고도화 · 🟡 기상 실연동 · 🟡 주간 히스토리

> 원칙: 인수위는 "다 된다"보다 **"이건 됐고, 이건 로드맵"**을 더 신뢰한다.
> 특히 젖소 정액 추천은 경기도 맥락의 핵심이므로 **반드시 로드맵으로 명시**(과장 금지).

---

## 5. 시연 직결 주의 (대본 연동)

- 시연 대본의 **"423번 감별진단"**: 확률 계산이 부분구현 → **시연 전 완성하거나 강도를 낮춰** 센서근거 제시 위주로.
- **정액 추천 시연 회피**(젖소 데이터에선 한우 API라 부정확) — 대신 발정탐지·수정적기·동기화 일정으로 번식 시연 구성.
- 음성 시연은 가능하나 브라우저 Web Speech 의존 → 현장 네트워크/브라우저 사전 점검.
