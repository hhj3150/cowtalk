# 하실장 브리핑 — CowTalk이 뭐고, 지금 어디까지 왔나

> 이 문서는 대표님의 비서 에이전트("하실장")가 **CowTalk 프로젝트를 인지하고
> 대표님을 보좌하기 위한 배경지식 문서**입니다. 개발 지침이 아니라 "현황 브리핑"입니다.
> 마지막 갱신: 2026-06-05 · 버전: v5.0

---

## 0. 한 문장 요약

**CowTalk은 smaXtec 위내센서 + 한국 공공데이터 + Claude AI + 역할별 액션플랜을
하나로 묶은 "축산 디지털 운영체제(Livestock Digital Operating System)"다.**

핵심 공식:

```
smaXtec 위내센서 + 국가 공공데이터 + AI 해석 + 역할별 액션플랜 = 통합 플랫폼
```

smaXtec을 복제하는 게 아니라, smaXtec의 목장 단위 센서 모니터링 **위에** 3개 레이어를 얹는다.

- **레이어 1 — 공공데이터 융합**: 이력제 + 혈통 + 품질평가 + DHI + KAHIS + 기상
- **레이어 2 — CowTalk AI**: 데이터 → AI 분석 → 결과 축적 → AI 재강화 루프
- **레이어 3 — 다중 역할·행정 디지털 전환**: 4개 역할이 같은 데이터를 각자 관점으로

확장 경로: **1개 농장 → 146개 농장 → 지역 → 국가**.

---

## 1. 왜 만드는가 (제품 철학)

smaXtec의 센서·알고리즘은 세계 최고지만 **"알람 → 행동" 사이에 다리가 없다.**
발정 알람이 와도 목장주가 "그래서 뭘 해야 하지?"를 혼자 판단해야 한다.

**CowTalk은 이 간극을 메운다: 알람 → 판단 → 추천 → 행동 → 기록이 한 화면에서 끝난다.**

3대 가치:
- **목장 경제성** — 번식성적 향상·질병 조기대응으로 수익 증가
- **질병 관리** — 위내센서+AI 조기감지로 피해 최소화
- **공공성** — 국가 방역 고도화, 전염병 확산 차단, 축산 디지털 주권

> 목적은 시연이 아니라 **실제 목장에 도움이 되는, 사회에 기여하는 프로그램**이다.

---

## 2. 핵심 개념 — 소 한 마리에 번호가 4개

하실장이 "소 번호" 얘기를 들으면 헷갈리지 않도록:

| 번호 | 자릿수/출처 | CowTalk DB | 비고 |
|---|---|---|---|
| 이력제 번호 | 12자리, 출생 2주 내 국가 발급(필수) | `animals.traceId` | EKAPE 조회 키 |
| 목장 관리번호 | 농장 자체 부여 | `animals.earTag` | smaXtec `mark/name` |
| 혈통등록번호 | 종축개량협회 발급 | — | 혈통등록 소만 |
| 센서 시리얼 | smaXtec 센서 삽입 시 | `animals.externalId` | smaXtec 자체 번호 |

→ **smaXtec API가 기초 마스터 데이터의 원천**이고, CowTalk이 여기에 한국 공공데이터를 보강한다.
데이터 방향은 **smaXtec → CowTalk 단방향 수신**.

---

## 3. 누가 쓰는가 (4개 역할)

같은 데이터를 역할별로 다르게 보여준다:

- **farmer (목장주)** — 개체 모니터링, 할 일, 건강 알림 + AI 강화 + 번식 관리
- **veterinarian (수의사)** — 담당 목장 그룹 관리, 역학, 질병 패턴 분석, Command Center
- **quarantine_officer (방역관)** — 146농장 통합 방역, 역학조사, 확산 시뮬레이션, 전국 현황
- **government_admin (정부 행정)** — 수급 조절, 축산 행정 디지털 전환

---

## 4. AI 아키텍처 (4층)

1. **Data Integration** — smaXtec 이벤트(신뢰) + 센서(보조) + 공공데이터 + 농장기록 → 통합 동물 프로필
2. **Claude AI Interpretation** — 통합 프로필 → Claude API가 해석 + 역할별 액션 생성 (v4 룰 엔진은 보조 힌트)
3. **Role-Based Serving** — 4개 역할별 대시보드·액션플랜
4. **Intelligence Loop** — 피드백 → 정확도 추적 → 프롬프트 개선 (모델 재학습 아님)

핵심 원칙:
- **smaXtec 이벤트는 재판단 안 함** (95%+ 정확도 신뢰)
- **Claude API가 핵심 해석 엔진**, v4 룰 엔진은 fallback + 보조 분석
- 모든 해석에 `explanation` + `contributingFactors` + `roleSpecific` 필수

AI 어시스턴트 이름은 **"팅커벨(Tinkerbell)"** — 화면 하단 고정 Claude 스타일 바.
방역관이 방역 키워드를 쓰면 **방역 전용 모드**로 자동 전환된다.

---

## 5. 기술 스택 / 구조

- **언어**: TypeScript (프론트+백+공유타입, `any` 금지)
- **프론트**: React 18 + Vite + Tailwind + Zustand + React Query
- **백엔드**: Express 5 + Drizzle ORM + Pino + Bull + Socket.IO
- **DB**: PostgreSQL 16 + TimescaleDB + Redis
- **AI**: Anthropic Claude API (핵심) + v4 룰 엔진 (fallback)
- **테스트**: Vitest · **배포**: Docker Compose + GitHub Actions + Netlify

**모노레포 구조** (`packages/`):
```
packages/shared   공유 타입
packages/server   백엔드 (ai-brain, pipeline, epidemic, intelligence-loop, serving …)
packages/web      프론트 (pages: dashboard, cow, breeding, vet, epidemiology, regional, admin …)
```

설계 문서: `CowTalk_v5_Renewal_Blueprint.md`, `docs/` 폴더(API_DOCS, DEPLOYMENT, QUICK_START 등).

---

## 6. 공공데이터 연동 (data.go.kr / EKAPE)

| 상태 | API | 용도 |
|---|---|---|
| ✅ 실연결 완료 | 축산물통합이력정보 (15058923) | 개체 이력 추적 |
| ✅ 구현 완료 | 축산물등급판정확인서 (grade) | 출하 등급·품질 |
| 🟡 활용신청 필요 | 쇠고기이력정보 (15056898) | 출생~도축 이력 |
| 🟡 활용신청 필요 | 축산물등급판정정보 (15058822) | 경락가격 포함 24개 오퍼레이션 |
| 🟡 활용신청 필요 | 한우 씨수소 정보 (15101999) | 정액 추천 AI |
| 🟡 활용신청 필요 | 농장식별번호정보 (15106233) | 농장 자동 매칭 |

커넥터 패턴: `packages/server/src/pipeline/connectors/public-data/` (AbstractConnector 상속).

---

## 7. 팅커벨 AI 도구 체계 (MCP, 20개)

`tool-definitions.ts → tool-executor.ts → tool-gateway.ts` 3파일 구조.
역할별 접근권한은 `ROLE_TOOL_ACCESS`, 모든 호출은 `tool_audit_log`에 기록.

- **센서**: query_animal, query_animal_events, query_sensor_data, query_weather
- **농장**: query_farm_summary, get_farm_kpis, record_treatment
- **번식**: query_breeding_stats, query_conception_stats, record_insemination,
  record_pregnancy_check, recommend_insemination_window
- **공공데이터**: query_traceability, query_grade, query_auction_prices,
  query_quarantine_dashboard, query_national_situation
- **유전**: query_sire_info
- **수의**: query_differential_diagnosis, confirm_treatment_outcome

---

## 8. 지금까지 구현된 것 (현황 체크포인트)

**기반 플랫폼**
- 4개 역할별 대시보드 + 드릴다운(전국→시도→농장→개체→AI 한 화면 완결)
- 팅커벨 AI 어시스턴트 (역할별 컨텍스트, 방역 모드 자동 전환)
- 20개 MCP 도구 + 감사 로그
- 공공데이터: 이력제·등급판정 실연결

**센서 파이프라인**
- 5분 주기, 30마리 배치, offset 순환(전체 ~20시간)
- 3단계 폴백(live API → daily_agg → measurements), 시뮬레이션 현실화
- 가짜 랜덤 데이터 제거 → `noData` 플래그로 신뢰성 확보

**번식 AI 루프**
- 6단계 칸반 파이프라인(open→발정→수정→임신→후기→분만)
- KPI 5개(수태율·발정탐지율·평균공태일·분만간격·첫수정일수)
- 번식 리마인더 5종 + 치료결과 추적 배치(24h)

**방역 시스템**
- DB 영속화 4테이블(investigations, animal_transfers, quarantine_actions, kahis_reports)
- 146개 농장 실좌표 지도(NationalMiniMap, Leaflet)
- 좌표 기반 시도 자동 매핑(경기52·충남27·충북24·경북14·전북10 …)

**품질/QA**
- P0~P2 QA 항목 전체 완료(알림설정·폼검증·접근성 등)
- 최근: AI 성능 대시보드 표본편향 경고, 빈 .catch 로깅, 자동 라벨러 드라이런

> 레퍼런스 목장: **674.해돋이목장(포천)**, org_id `63e20bfb2e8ffd40cbbc29a6`,
> 87두(착유 76·건유 11), 이벤트 기록이 성실해 AI 학습 데이터로 최적.

---

## 9. 아직 남은 것 / 다음 방향

- 공공데이터 4건 **활용신청 후 실연결**(씨수소·농장식별·쇠고기이력·등급판정 상세)
- 젖소 종모우 데이터 소스 연동(DCIC/젖소개량사업소) — 한우는 연동 완료
- 번식 AI 루프 정밀화: 근교계수 계산, DHI 성적 반영, 임신감정 피드백 학습
- 글로벌 확장 대비 i18n / 국가별 어댑터 패턴

---

## 10. 하실장이 알아둘 운영 메모

- **현재 작업 브랜치**: `claude/wonderful-ritchie-1XU4C` (개발은 지정 브랜치에서)
- **레포**: `hhj3150/cowtalk`
- 핵심 규칙: TypeScript only, DB-first, 테스트 필수, 비파괴적(작동 기능 깨지 않기),
  smaXtec 신뢰, Claude 해석 중심, 빈 `.catch()` 금지
- 상세 개발 지침의 원천은 루트 **`CLAUDE.md`** (이 브리핑은 그 요약·현황판)

### 대표님을 보좌할 때 하실장 체크리스트
1. 요청이 **어느 역할/레이어**에 관한 것인지 먼저 분류(목장주/수의사/방역관/행정).
2. smaXtec에 이미 있는 데이터인지 확인 — **중복 구현 금지**.
3. 모든 알람·분석엔 **"그래서 뭘 해야 하나(액션)"**가 따라붙어야 한다.
4. 변경 후 보고 형식: ①분석 ②보존 ③구현 ④변경파일 ⑤테스트결과 ⑥누락 ⑦다음 단계.

---

*이 문서는 CowTalk의 살아있는 현황을 요약한다. 큰 변화가 생기면 갱신할 것.*
