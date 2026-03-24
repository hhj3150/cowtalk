######################################################################
# CLAUDE.md — CowTalk v5.0 Project Intelligence Instructions
######################################################################

## 프로젝트 정체성

CowTalk v5.0은 축산 디지털 운영체제(Livestock Digital Operating System)입니다.

핵심 공식:
smaXtec 위내센서 + 국가 공공데이터 + AI 해석 + 역할별 액션플랜 = 통합 플랫폼

smaXtec을 복제하는 것이 아니라, smaXtec 목장 단위 센서 모니터링 위에 3개 레이어를 추가한다:
- 레이어 1 — 공공데이터 융합 (이력제 + 혈통 + 품질평가 + DHI + KAHIS + 기상)
- 레이어 2 — CowTalk AI (데이터 → AI 분석 → 결과 축적 → AI 재강화 루프)
- 레이어 3 — 다중 역할·행정 디지털 전환 (6개 역할이 같은 데이터를 각자 관점으로)

이 플랫폼은 1개 농장 → 146개 농장 → 지역 → 국가로 확장됩니다.

## 소의 번호 체계

한 마리 소에 최대 4개 번호가 존재한다:
1. **이력제 번호 (12자리)** — 출생 2주 이내 발급, 국가 시스템 등록 (필수)
   - smaXtec `official_id` → CowTalk DB `animals.traceId`
   - 축산물이력추적시스템(ekape) API 조회 키로 사용
2. **목장 관리번호** — 농장 자체 부여 번호
   - smaXtec `mark` / `name` → CowTalk DB `animals.earTag`
3. **혈통등록번호** — 혈통등록 소에만 존재
   - 한국종축개량협회 발급
4. **센서 시리얼** — smaXtec 센서 삽입 시 발급 (smaXtec 자체 번호)
   - smaXtec `current_device_id` → CowTalk DB `animals.externalId`

smaXtec에 센서를 삽입할 때 농장주가 이력제번호·관리번호·기초데이터를 입력하므로,
smaXtec API가 기초 마스터 데이터의 원천이다. CowTalk은 이를 읽어오고 한국 공공데이터를 보강한다.

## 공공데이터 연동 (data.go.kr)

data.go.kr 공공데이터포털 API를 활용한다.
기존 키: PUBLIC_DATA_API_KEY (.env에 설정됨)
연동 대상 API (활용신청 후 사용 가능):

| 우선순위 | API명 | data.go.kr ID | 용도 |
|---|---|---|---|
| 1 | 쇠고기이력정보 | 15056898 | 개체 이력 추적 (출생~도축) |
| 1 | 축산물통합이력정보 | 15058923 | 이동이력·도축정보 |
| 2 | 축산물등급판정정보 | 15058822 | 출하 등급·품질 |
| 2 | 축산물경락가격정보 | 15057912 | 시세 대시보드 |
| 3 | 농장식별번호정보 | 15106233 | 농장 자동 매칭 |
| 3 | 씨수소 정보 | 15101999 | 정액 추천 AI |
| 3 | 소 브루셀라 검사결과 | 15058595 | 방역 대시보드 |
| 3 | 가축 더위지수 | 축산과학원 | 열사병 보정 |

구독 완료 (2건):
- 축산물통합이력정보 (15058923) → TraceabilityConnector 실연결 완료
  - endpoint: http://data.ekape.or.kr/openapi-data/service/user/animalTrace/traceNoSearch
  - 파라미터: traceNo(필수), optionNo(1~9), serviceKey
- 축산물등급판정확인서 (grade API) → GradeConnector 미구현
  - endpoint: https://data.ekape.or.kr/openapi-data/service/user/grade

활용신청 필요 (4건, 자동승인):
- 쇠고기이력정보 (15056898) → cattle/cattleMove 엔드포인트
- 축산물등급판정정보 (15058822) → 24개 오퍼레이션 (경락가격 포함)
- 한우 씨수소 정보 (15101999) → apis.data.go.kr/1390906/brblInfo_gong/getList_brblInfo
- 농장식별번호정보 (15106233) → farmUniqueNoSearch

커넥터 패턴: packages/server/src/pipeline/connectors/public-data/
각 커넥터는 AbstractConnector 상속, connect()/fetch()/disconnect() 구조

## 기술 스택

- 언어: TypeScript (프론트 + 백엔드 + 공유 타입)
- 프론트: React 18 + Vite + Tailwind + Zustand + React Query
- 백엔드: Express 5 + Drizzle ORM + Pino + Bull + Socket.IO
- DB: PostgreSQL 16 + TimescaleDB + Redis
- AI: Anthropic Claude API (핵심 해석 엔진) + v4 룰 엔진 (fallback/보조)
- 테스트: Vitest
- 배포: Docker Compose + GitHub Actions

## 구조

모노레포: packages/shared, packages/server, packages/web
블루프린트: CowTalk_v5_Renewal_Blueprint.md 참조

## 핵심 규칙

1. 타입 안전: 모든 코드 TypeScript, any 금지
2. DB-first: 인메모리 중심 금지, 모든 데이터 DB 거침
3. 테스트 필수: 새 서비스 작성 시 테스트 함께
4. Data Spine 준수: AI가 파이프라인을 우회하지 않음
5. smaXtec 신뢰: smaXtec 이벤트(95%+ 정확도)는 재판단하지 않고 신뢰
6. Claude 해석 중심: 센서 이벤트 + 맥락 → Claude API가 해석 + 역할별 액션 생성
7. Fallback 보장: Claude API 불가 시 v4 룰 엔진이 대체 분석 수행
8. 역할별 출력: roleSpecific 필드 필수
9. 드릴다운 내장: KpiCard는 클릭 가능이 기본값
10. 에러 처리: 빈 .catch() 금지, ErrorFallback 필수
11. 비파괴적: 작동 중인 기능을 깨지 마라
12. v4 이식: 도메인 로직은 v4에서 가져오되 구조는 v5 따름

## AI 아키텍처 (4층 구조)

1층 — Data Integration:
  smaXtec 이벤트(신뢰) + 센서 데이터(보조) + 공공데이터 + 농장기록
  → 통합 동물 프로필 생성

2층 — Claude AI Interpretation:
  통합 프로필 → Claude API → 맥락 해석 + 역할별 액션 생성
  v4 룰 엔진은 보조 분석(context hints)으로 Claude에 전달

3층 — Role-Based Serving:
  6개 역할별 맞춤 대시보드 + 액션플랜
  - farmer: smaXtec 기본 기능(개체 모니터링, 할 일, 건강 알림) + AI 강화
  - veterinarian: 담당 목장 그룹 관리, 역학 관리(공수의사), 질병 패턴 분석
  - inseminator: 번식 관리, 인공수정, 계획교배, 혈통·유전체 기반 교배 추천
  - quarantine_officer: 146농장 통합 방역, 역학 조사, 확산 시뮬레이션, 전국 현황
  - government_admin: 수급 조절, 축산 행정 디지털 전환 (아날로그→디지털)
  - feed_company: 사양 관리, 사료 효율 분석

4층 — Intelligence Loop:
  피드백 → 정확도 추적 → 프롬프트 개선 (모델 재학습 아님)

핵심 원칙:
- smaXtec 이벤트는 재판단하지 않음 (95%+ 정확도 신뢰)
- Claude API가 핵심 해석 엔진
- v4 룰 엔진은 Claude 불가 시 fallback + 보조 분석
- 모든 해석에 explanation + contributingFactors + roleSpecific 필수

## smaXtec 웹앱 구조 (참조)

smaXtec 원본 웹앱(web.smaxtec.com)의 구조를 참조하되 복제하지 않는다:
- 네비게이션: 개체 찾기/현황판/My Assistant/메시지/개체/우군/센서·통신장비/사양/Integrations/목장/Shop
- 현황판: Herd overview(4카드) + Herd development(착유우/건유우/육성우 추이) + To-do list + 반추 차트 + Health alerts(6종)
- My Assistant: 조건별 필터 리포트 카드 (유열예방, 케토시스, CMT, 건유우유방염, 조기유산 등)
- 개체 상세: 식별번호/관리번호/우군/번식상태/출생일/DIM/품종/볼루스상태 + 이벤트타임라인 + 알람히스토리
- 기술: Angular SPA, 다크 테마, orgId 기반 다중 목장 전환

CowTalk은 이 위에 공공데이터+AI+다중역할 레이어를 추가한 확장 플랫폼이다.

## smaXtec API 구조

두 개 API 베이스:
- Integration API: https://api.smaxtec.com/integration/v2 (조직/개체/이벤트 벌크 조회)
- Public API: https://api.smaxtec.com/api/v2 (노트/할일/이벤트/센서 데이터)

Notes 구조 (smaXtec 노트 = note + event + todo 세 가지 동시 생성):
- POST /api/v2/notes — 노트 생성 (개별 조회만 GET /notes/{id}, 목록 조회 없음)
- GET /api/v2/organisations/{org_id}/todos — 할일 목록 (노트와 todo_id로 연결)
- GET /api/v2/events — 이벤트 목록 (사용자 노트도 이벤트로 포함)
- GET /integration/v2/organisations/{org_id}/events — 통합 이벤트

NoteSchema 핵심 필드: reference_type, reference_id (=animal_id), category, note_event, note_actions
노트 카테고리: 유방(유방염 등), 대사(유열/케토시스), 번식(자궁염), 호흡기(폐렴), 다리/발굽(파행), 소화기(과산증/설사), 개체관리(이표분실/도태)
→ category/note_event 값이 AI 레이블링(질병 분류)에 직접 활용됨

디버그 라우트: /api/smaxtec-notes/debug (3개 API 동시 비교, smaxtec-notes.routes.ts)

데이터 방향: smaXtec → CowTalk (단방향 수신만). CowTalk→smaXtec 역방향 동기화 불필요.

## smaXtec 이벤트 기반 AI 학습

레퍼런스 목장: 674.해돋이목장(포천)
- org_id: 63e20bfb2e8ffd40cbbc29a6
- 규모: 87두 (착유우 76, 건유우 11)
- 특징: 이벤트/노트가 매우 성실하게 기록되어 있어 AI 학습 데이터로 최적

핵심 AI 학습 패턴:
1. 발정 알람 → 수정 성공률 예측 (센서 바이탈 + 착유일수 + 질병이력 → pregnant 여부)
2. 수정 후 임신 유지 예측 (수정 전후 센서 + 산차 + 이전 이력 → 유산 위험)
3. No insemination 사유 자동 판단 (발정 시점 센서 + 개체 상태 → "번식장애"/"유량 높음" 등)
4. 질병 후 번식 영향 분석 (유방염/케토시스 발생 후 최적 수정 시기)

핵심 API 엔드포인트:
- GET /integration/v2/organisations/{org_id}/animals/{official_id}/events — 개체별 전체 이벤트 (가장 중요)
  - event_type: "heat", "insemination", "pregnancy_result", "abort", "dry_off" 등 문자열
  - pregnant: boolean (임신감정 직접 레이블)
  - reason: 미수정 사유 (no_insemination)
- GET /api/v2/events?organisation_id={org_id} — 조직 전체 이벤트
- GET /api/v2/events/categories?organisation_id={org_id} — 이벤트 카테고리 목록
- GET /integration/v2/translations/ko/events — 이벤트명 한국어 번역

개체별 번식 이벤트 엔드포인트 (Public API v2):
- GET /api/v2/animals/{animal_id}/heats — 발정
- GET /api/v2/animals/{animal_id}/inseminations — 수정
- GET /api/v2/animals/{animal_id}/pregnancy_results — 임신감정
- GET /api/v2/animals/{animal_id}/no_insemination — 미수정 (reason 필드)
- GET /api/v2/animals/{animal_id}/aborts — 유산
- GET /api/v2/animals/{animal_id}/dry_offs — 건유
- GET /api/v2/animals/{animal_id}/calving_confirmations — 분만확인
- GET /api/v2/animals/{animal_id}/diagnosis — 진단

참조 개체: 423번 (animal_id: 63e4a444dcb0d8864da821eb, official_id: 002132665191) — 이벤트 가장 풍부

## 번식 AI 루프 (다음 구현 대상)

목적: 발정 알람 → 수정 적기 → 정액 추천 → 기록 → 피드백 루프
smaXtec의 한계(알람만 오고 행동 연결 없음)를 CowTalk이 메운다.

흐름:
1. smaXtec 발정 알람 수신
2. 수정 적기 자동 계산 (발정 시작 시점 + 최적 수정 타이밍)
3. 목장 보유 정액 중 최적 추천 (근교계수 + 혈통 + 유전체 + 생산성적 기반)
4. ⚠️ 수정 전 체크: 최근 질병 이력, 치료 완료 여부, 이전 수정 실패 횟수
5. 수정사에게 알림: "○○목장 423번 — 수정적기 내일 06시, 추천정액 KPN1234"
6. 수정 완료 → 실제 사용 정액 기록 (DB)
7. 임신감정 결과 피드백 → AI 학습
8. DHI 성적 + 유전체 정보 → 다음 세대 추천 정확도 향상

필요 데이터:
- farm_semen_inventory: 목장별 보유 정액 목록 (종모우번호, 보유수량, 유전정보)
- 씨수소 정보 API (15101999): 전국 종모우 유전능력
- DHI 커넥터: 젖소검정 성적 (유량, 유지방, 유단백, SCC)
- breeding_events: 수정 기록 (일자, 정액번호, 수정사)
- pregnancy_checks: 임신감정 결과 (임신/미임신)

근교계수 계산: 혈통 3대 기준 근교계수, 6.25% 이상 경고

품종별 종모우 데이터 소스:
- 한우: 씨수소 정보 API (15101999, 농촌진흥청) — 공공데이터 연동 완료
- 젖소: 한국종축개량협회(DCIC) 또는 젖소개량사업소 — 별도 연동 필요
  - 해외 종모우: CDCB (미국), CRV (네덜란드) 등 — 향후 확장
- ⚠️ 정액 추천 시 반드시 동일 품종만 추천 (한우↔젖소 교차 추천 금지)

## 개발 철학

CowTalk의 목적은 시연이 아니라 실제 목장에 도움이 되는, 사회와 세계에 기여하는 프로그램이다.

smaXtec의 한계: 센서와 알고리즘은 세계 최고지만, "알람 → 행동" 사이의 다리가 없다.
발정 알람이 와도 목장주가 "그래서 뭘 해야 하지?"를 혼자 판단해야 한다.
CowTalk은 이 간극을 메운다: 알람 → 판단 → 추천 → 행동 → 기록이 한 화면에서 끝나야 한다.

3대 가치:
- 목장 경제성 — 번식성적 향상, 질병 조기 대응으로 수익 증가
- 질병 관리 — 위내센서+AI 조기감지로 피해 최소화
- 공공성 — 국가 방역 고도화, 전염병 확산 차단, 축산 디지털 주권

## 개발 원칙

1. 기존 틀 유지 — 현재 구조/컴포넌트/API 패턴을 깨지 않고 보완·확장
2. smaXtec 데이터가 원천 — smaXtec에 이미 존재하는 데이터를 중복 구현하지 않음
3. 공공데이터 연결 — 이력제·혈통·품질평가·DHI를 smaXtec 개체 데이터와 매핑
4. AI 데이터 루프 — 센서+공공데이터 → AI 분석 → 결과 축적 → AI 재강화 (순환 구조)
5. 수출 대비 — 한국 특화이되 글로벌 확장 가능 구조 (i18n, 국가별 어댑터 패턴)
6. 알람→행동 완결 — 모든 알람에 "그래서 뭘 해야 하는지"가 즉시 따라와야 함
7. 목장주 편의 최우선 — 목장주 성향에 관계없이 누구나 바로 쓸 수 있어야 함

## QA 점검 진행 상황 (2026-03-25)

P0 전체 완료:
- #1 알림설정: notification.api.ts 응답 매핑 수정 (isEnabled→enabled, channels→배열)
- #2 사용자폼: 이름(2자↑), 이메일(형식), 비밀번호(8자↑) 검증 추가
- #3 하단네비, #4 알림벨→NotificationDrawer, #5-6 두수불일치 동기화

P1 전체 완료:
- #7 지역지도 탭: 서버 regional.routes.ts에서 mode별 이벤트 집계 로직 추가
- #8 개체로딩: CowProfilePage AbortController + withTimeout(핵심8초/보조5초) 적용
- #9 시스템상태: admin.routes.ts 신규 생성 (GET /admin/system — DB/Claude/파이프라인)
- #10 사용자목록: API 경로 /admin/users → /users 수정

P2 전체 완료 (접근성/UX):
- #11 DataTable: 정렬 헤더 keyboard(Enter/Space) + aria-sort + 검색 label
- #12 LoginPage: 브랜드 색상이므로 CSS변수 불필요 (스킵)
- #13 LoginPage: aria-required + autoComplete(email/current-password)
- #14 MobileBottomNav: nav aria-label + 버튼 aria-label + aria-current
- #15 KpiCard: 의미있는 aria-label (값+단위+동작)
- #16 NotificationPreferences: 토글 체크박스 aria-label
- #17 SearchBar: input role=combobox + aria-expanded + 결과 role=listbox
- #18 MicButton: type=button + aria-label (title 대체) + SVG aria-hidden
- #19~25: MobileBottomNav SVG aria-hidden + 기타 아이콘 접근성

AnimalDetail "개체를 찾을 수 없습니다" 버그 수정 완료:
원인: 서버가 flat 구조 반환하는데 코드가 data.animal (nested) 접근
수정: const animal = (rawData.animal ?? rawData) 패턴으로 양쪽 대응

## 보고 형식 (매 작업 후)

1. 분석한 것
2. 보존한 것 (v4에서 이식한 로직)
3. 구현한 것
4. 변경된 파일 목록
5. 테스트 결과
6. 아직 누락된 것
7. 다음 안전한 단계
