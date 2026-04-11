# CowTalk v5.0 기술 기반 핸드오프 문서
## 주관기업(소프트웨어 개발사) 전달용

**문서 버전**: 1.0
**작성일**: 2026-04-11
**작성처**: D2O Corp
**수신처**: 주관기업 개발팀
**목적**: CowTalk v5.0 플랫폼을 기반으로 한 추가 소프트웨어 개발 착수를 위한 기술 핸드오프

---

## 목차

1. [플랫폼 정체성 및 개발 방향](#1-플랫폼-정체성-및-개발-방향)
2. [아키텍처 (모노레포 3-패키지)](#2-아키텍처-모노레포-3-패키지)
3. [기술 스택](#3-기술-스택)
4. [핵심 확장 포인트](#4-핵심-확장-포인트)
5. [데이터 모델 핵심 테이블](#5-데이터-모델-핵심-테이블)
6. [외부 시스템 연동 현황](#6-외부-시스템-연동-현황)
7. [현재 완성 기능 vs 신규 개발 영역](#7-현재-완성-기능-vs-신규-개발-영역)
8. [개발 환경 및 배포](#8-개발-환경-및-배포)
9. [권장 개발 로드맵](#9-권장-개발-로드맵)
10. [상용화 성숙도 증빙](#10-상용화-성숙도-증빙)

---

## 1. 플랫폼 정체성 및 개발 방향

### 1.1 CowTalk v5.0 정의

**CowTalk v5 = 축산 디지털 운영체제 (Livestock Digital Operating System)**

> smaXtec 위내센서 + 국가 공공데이터 + Claude AI 해석 + 역할별 액션플랜

### 1.2 주관기업 개발 방향

주관기업은 CowTalk 위에 **국가 축산행정 · 방역 · 경기도 AI 축산 · 신규 서비스**를 얹는 형태로 개발을 진행합니다. CowTalk은 재개발 대상이 아니라, 다음 4가지 요소를 **추가**하는 확장형 플랫폼입니다.

- **Connector** 추가 — 외부 데이터 소스 연동
- **MCP Tool** 추가 — AI가 사용할 도구
- **Role** 추가 — 신규 사용자 역할
- **UI Card** 조합 — 재사용 카드로 대시보드 구성

### 1.3 3대 핵심 가치

| 가치 | 내용 |
|---|---|
| 목장 경제성 | 번식성적 향상, 질병 조기 대응으로 수익 증가 |
| 질병 관리 | 위내센서 + AI 조기감지로 피해 최소화 |
| 공공성 | 국가 방역 고도화, 전염병 확산 차단, 축산 디지털 주권 |

---

## 2. 아키텍처 (모노레포 3-패키지)

### 2.1 디렉토리 구조

```
cowtalk-v5/
├─ packages/
│  ├─ shared/     # 타입, 스키마, 상수 (프론트/백엔드 공유)
│  ├─ server/     # Express 5 + Drizzle ORM + Pipeline + AI Engine
│  └─ web/        # React 18 + Vite + Tailwind + Zustand
```

### 2.2 4-Layer AI Pipeline

AI 해석의 단방향 흐름을 강제하여 일관성을 보장합니다.

```
Layer 1: Data Integration
  smaXtec Events(신뢰) + Sensor Data + Public Data + Farm Records
                         ↓
Layer 2: Claude AI Interpretation
  통합 프로필 → Claude API → 맥락 해석 + 역할별 액션
  (v4 룰 엔진 = 보조 hint + fallback)
                         ↓
Layer 3: Role-Based Serving
  farmer / veterinarian / quarantine_officer / government_admin
                         ↓
Layer 4: Intelligence Loop
  피드백 → 정확도 추적 → 프롬프트 개선
```

### 2.3 주관기업 개발 시 필수 준수 원칙

| 원칙 | 내용 |
|---|---|
| 1. smaXtec 신뢰 | smaXtec 이벤트(95%+ 정확도)는 재판단 금지, 신뢰하고 소비 |
| 2. Data Spine 준수 | AI가 DB를 직접 건드리지 않고 파이프라인 경유 |
| 3. DB-first | 인메모리 상태 금지, 모든 데이터 PostgreSQL 경유 |
| 4. 역할별 출력 | `roleSpecific` 필드 없으면 불완전한 응답으로 간주 |
| 5. 타입 안전 | `any` 금지, shared 패키지에 타입 집중 |

---

## 3. 기술 스택

### 3.1 스택 구성 및 필요 역량

| 계층 | 기술 | 필요 역량 |
|---|---|---|
| Language | TypeScript 5.x (strict) | TS 중급+, 제네릭/유틸리티 타입 |
| Frontend | React 18 + Vite + Tailwind | React Hooks, Zustand, React Query |
| Backend | Express 5 + Drizzle ORM | REST API, 미들웨어, 트랜잭션 |
| Database | PostgreSQL 16 + TimescaleDB + Redis | 시계열 쿼리, 파티셔닝, Bull Queue |
| Realtime | Socket.IO | Room 기반 브로드캐스트 |
| AI | Anthropic Claude API (Opus/Sonnet) | Prompt Engineering, Tool Use |
| Testing | Vitest | Unit + Integration (pool: forks) |
| DevOps | Docker Compose + GitHub Actions | Railway(API) + Netlify(Web) |

### 3.2 최소 팀 구성 권장

- **Frontend 개발자**: 1명
- **Backend 개발자**: 2명 (AI/Pipeline 전담 1명 포함)
- **DevOps**: 0.5명
- **QA**: 0.5명

---

## 4. 핵심 확장 포인트

### 4.1 Connector 패턴 (외부 데이터 통합)

```
packages/server/src/pipeline/connectors/
├─ public-data/
│  ├─ AbstractConnector.ts       ← 상속해서 신규 API 추가
│  ├─ traceability.connector.ts  ← 이력제 (구독 완료)
│  └─ grade.connector.ts         ← 등급판정 (구독 완료)
```

**신규 외부 API 추가 패턴**

```typescript
class NewConnector extends AbstractConnector {
  async connect() { /* 인증 */ }
  async fetch(params) { /* 조회 */ }
  async disconnect() { /* 정리 */ }
}
```

### 4.2 MCP Tool 패턴 (AI 도구 추가)

```
packages/server/src/ai/tools/
├─ tool-definitions.ts   ← 신규 도구 스키마 선언
├─ tool-executor.ts      ← 실행 로직
└─ tool-gateway.ts       ← 역할별 접근 제어 (ROLE_TOOL_ACCESS)
```

현재 **20개 도구**가 등록되어 있습니다. 주관기업은 국가행정/경기도 특화 도구를 이 3-파일 구조에 추가하면 즉시 AI가 사용하게 됩니다. 모든 호출은 `tool_audit_log` 테이블에 자동 감사 기록됩니다.

### 4.3 현재 등록된 MCP 도구 20개

| 도메인 | 도구 수 | 대표 도구 |
|---|---|---|
| sensor | 4 | query_animal, query_sensor_data, query_weather |
| farm | 3 | query_farm_summary, get_farm_kpis, record_treatment |
| repro | 5 | recommend_insemination_window, record_insemination, query_conception_stats |
| public_data | 5 | query_traceability, query_grade, query_auction_prices, query_quarantine_dashboard, query_national_situation |
| genetics | 1 | query_sire_info (한우 씨수소) |
| vet | 2 | query_differential_diagnosis, confirm_treatment_outcome |

### 4.4 Role 확장

현재 4개 역할이 구현되어 있습니다.

- `farmer` — 목장주
- `veterinarian` — 수의사
- `quarantine_officer` — 방역관
- `government_admin` — 행정관리자

**신규 역할 추가 시 수정 파일**

| 파일 | 역할 |
|---|---|
| `shared/src/types/role.ts` | 타입 추가 |
| `server/src/ai/tools/tool-gateway.ts` | ROLE_TOOL_ACCESS 매핑 |
| `server/src/ai/prompts/` | 역할별 시스템 프롬프트 |
| `web/src/pages/{role}/` | 전용 대시보드 |

### 4.5 UI Card 패턴

재사용 가능한 카드 컴포넌트가 정리되어 있어, 신규 지표는 카드 조합으로 빠르게 구성 가능합니다.

- `CowProfilePage` — 개체 상세
- `CollapsibleCard` — 모바일 접힘/데스크톱 펼침
- `KpiCard` — 핵심 지표 카드
- `NationalMiniMap` — 전국 지도 (Leaflet)
- `TinkerbellAssistant` — AI 대화창

---

## 5. 데이터 모델 핵심 테이블

### 5.1 카테고리별 테이블

| 카테고리 | 테이블 | 용도 |
|---|---|---|
| 마스터 | farms, animals, users, roles | 조직/개체/사용자 |
| smaXtec | smaxtec_events, sensor_measurements, sensor_daily_agg | 센서/이벤트 |
| 번식 | breeding_events, pregnancy_checks, insemination_records | 번식 파이프라인 |
| 건강 | treatments, treatment_outcomes, differential_diagnoses | 질병/치료 |
| 방역 | investigations, animal_transfers, quarantine_actions, kahis_reports | 역학/방역 |
| 공공데이터 | traceability_cache, grade_cache | API 응답 캐시 |
| AI | tool_audit_log, ai_conversations, ai_feedback | AI 감사/피드백 |
| 농장 설정 | farms.breeding_settings (JSONB) | 목장별 번식 파라미터 |

### 5.2 ORM

**Drizzle ORM** — 스키마는 `packages/server/src/db/schema/` 에 도메인별로 분할되어 있습니다.

### 5.3 소 번호 체계 (중요)

한 마리 소에 최대 4개 번호가 존재합니다.

| 번호 | 길이 | 발급처 | DB 컬럼 |
|---|---|---|---|
| 이력제 번호 | 12자리 | 국가 시스템 (필수) | `animals.traceId` |
| 목장 관리번호 | 자유 | 농장 자체 부여 | `animals.earTag` |
| 혈통등록번호 | 자유 | 한국종축개량협회 | 별도 필드 |
| 센서 시리얼 | 자유 | smaXtec | `animals.externalId` |

---

## 6. 외부 시스템 연동 현황

### 6.1 smaXtec (단방향 수신)

| 항목 | 내용 |
|---|---|
| Integration API | `https://api.smaxtec.com/integration/v2` |
| Public API | `https://api.smaxtec.com/api/v2` |
| 센서 파이프라인 | 5분 주기 배치, 30마리/배치, offset 순환 |
| 전체 순환 주기 | 7,000마리 기준 약 20시간 |
| 수집 메트릭 | temperature, activity |
| 중복 방지 | `(animal_id, timestamp, metric_type)` unique index |
| 검증 결과 | 첫 사이클 1,616건 × 28마리 수집 확인 |

### 6.2 공공데이터 (data.go.kr)

| 상태 | API명 | data.go.kr ID | 엔드포인트 |
|---|---|---|---|
| 구독 완료 | 축산물통합이력정보 | 15058923 | data.ekape.or.kr/.../traceNoSearch |
| 구독 완료 | 축산물등급판정확인서 | - | data.ekape.or.kr/.../grade |
| 신청 대상 | 쇠고기이력정보 | 15056898 | cattle/cattleMove |
| 신청 대상 | 축산물등급판정정보 | 15058822 | 24개 오퍼레이션 |
| 신청 대상 | 한우 씨수소 정보 | 15101999 | brblInfo_gong |
| 신청 대상 | 농장식별번호정보 | 15106233 | farmUniqueNoSearch |

**환경변수**: `PUBLIC_DATA_API_KEY` (.env)

---

## 7. 현재 완성 기능 vs 신규 개발 영역

### 7.1 완성된 기능 (주관기업이 재활용할 자산)

- [x] smaXtec 센서 파이프라인 (배치 + TimescaleDB 저장)
- [x] Claude AI 해석 엔진 + 비식별화 레이어
- [x] MCP 도구 20개 + 감사 로그 + 역할별 접근 제어
- [x] 4개 역할 대시보드 (목장주/수의사/방역관/행정)
- [x] 번식 파이프라인 6단계 칸반 + KPI 5종
- [x] 감별진단 UI (6개 질병 확률 + 센서 근거 + 확인검사 트리)
- [x] 치료 결과 자동 추적 배치 (recovered/worsened/monitoring)
- [x] 번식 리마인더 5종 자동 배치
- [x] 방역 DB 영속화 (investigations/transfers/actions/reports)
- [x] 146농장 전국 드릴다운 지도 (좌표→시도 자동 매핑)
- [x] WAI-ARIA 접근성 P0~P2 완료
- [x] GitHub → Railway + Netlify CI/CD 파이프라인

### 7.2 번식 파이프라인 6단계 칸반 (완성)

```
open → 발정 → 수정 → 임신 → 후기 → 분만
```

**KPI 5개**: 수태율, 발정탐지율, 평균공태일, 분만간격, 첫수정일수

**긴급 조치 자동 트리거**: inseminate_now, pregnancy_check_due, calving_imminent, repeat_breeder

### 7.3 주관기업 신규 개발 권장 영역

| 우선순위 | 개발 항목 | 비고 |
|---|---|---|
| 높음 | MDM (Master Data Management) | 목장/개체/센서 등록 UI, 시연 후 착수 예정 |
| 높음 | 멀티테넌시 강화 | 시/도 단위 테넌트 분리 (경기도 사업 대비) |
| 높음 | 행정 전용 대시보드 | 시도지사/시장/군수용 정책 지표 |
| 중간 | KAHIS 실연동 | 현재 스키마만 존재, 실 API 연결 필요 |
| 중간 | DHI 커넥터 | 젖소 검정 성적 실연결 |
| 중간 | 경락가격 수급 예측 모듈 | 기존 query_auction_prices 위에 예측 레이어 |
| 중간 | 이해관계자 알림 채널 | SMS/카카오 알림톡/이메일 확장 |
| 낮음 | i18n 다국어 | 중앙아시아 5개국 수출 대비 (구조는 준비됨) |
| 낮음 | 모바일 앱 전환 | 현재 PWA → React Native 검토 |

---

## 8. 개발 환경 및 배포

### 8.1 로컬 개발 환경

```bash
# 의존성 설치
pnpm install

# 개발 서버 실행
pnpm --filter server dev    # API (:3001)
pnpm --filter web dev       # Web (:5173)

# 테스트
pnpm test                   # Vitest (pool: forks, maxForks: 4, timeout: 15s)

# DB 초기화
docker compose up -d postgres redis
pnpm --filter server db:push
pnpm --filter server db:seed
```

### 8.2 배포 (자동화)

```bash
git push origin main        # → Railway(API) + Netlify(Web) 자동 배포
```

### 8.3 필수 환경변수

| 변수명 | 용도 |
|---|---|
| `DATABASE_URL` | PostgreSQL 연결 |
| `REDIS_URL` | Redis 연결 |
| `ANTHROPIC_API_KEY` | Claude API 인증 |
| `SMAXTEC_USERNAME` / `SMAXTEC_PASSWORD` | smaXtec API 인증 |
| `PUBLIC_DATA_API_KEY` | data.go.kr 인증 |
| `JWT_SECRET` | 세션 토큰 서명 |

---

## 9. 권장 개발 로드맵

### Phase A — 환경 구축 및 리딩 (1~2주)

- 레포 clone 및 로컬 빌드 성공 확인
- 기존 테스트 통과 확인
- 아키텍처 리딩 세션 (D2O ↔ 주관기업)
- 커넥터 패턴 / MCP 도구 패턴 핸즈온 실습

### Phase B — 도메인 확장 (4~6주)

- 국가/지자체 특화 MCP 도구 추가
- 행정 역할 대시보드 확장
- MDM 모듈 착수

### Phase C — 통합 및 상용화 (4~6주)

- KAHIS/DHI 실연동
- 멀티테넌시 강화
- 부하 테스트 및 SLA 튜닝
- 보안 감사 (tool_audit_log 리포팅)

### Phase D — 운영 (지속)

- AI 프롬프트 A/B 테스트
- 피드백 루프 기반 정확도 개선
- 신규 역할/도구 반복 추가

---

## 10. 상용화 성숙도 증빙

계획서 첨부용으로 강조 가능한 항목입니다.

| 항목 | 증빙 내용 |
|---|---|
| 실고객 확보 | 146농장 7,143두 실운영 (D2O Corp, smaXtec 한국 파트너) |
| 공공데이터 실연결 | 이력제 + 등급판정확인서 실API 호출 검증 완료 |
| 센서 파이프라인 검증 | 5분 주기 배치로 1,616건/사이클 × 28마리 수집 검증 |
| AI 감사 추적 | 모든 AI 도구 호출이 tool_audit_log에 자동 기록 — 국가 행정 도입 필수 요건 충족 |
| 역할 기반 접근 제어 | 4개 역할별 도구 접근 권한 분리 (ROLE_TOOL_ACCESS) |
| 비식별화 처리 | Claude API 전송 시 개인정보 제거 레이어 적용 |
| 배치 자동화 | 번식 리마인더 5종 + 치료 결과 추적 24h 배치 가동 |
| 방역 DB 영속화 | 역학 조사 · 접촉추적 · 방역조치 PostgreSQL 영속 저장 |
| 확장성 | 모노레포 + 커넥터 패턴 + i18n 구조 |
| 자동 배포 | GitHub → Railway(서버) + Netlify(웹) CI/CD 파이프라인 |
| 보안 | JWT 인증 + DB 영속화 + 감사 로그 |

---

## 부록 A — 참고 문서

- `CLAUDE.md` — 프로젝트 전체 지시서 (본 문서의 원천)
- `CowTalk_v5_Renewal_Blueprint.md` — v5 설계 블루프린트
- `docs/API_DOCS.md` — API 명세
- `docs/DEPLOYMENT.md` — 배포 가이드
- `docs/QUICK_START.md` — 개발자 빠른 시작

## 부록 B — 주관기업 점검 체크리스트

**Phase A 착수 전 확인사항**

- [ ] CowTalk 소스 접근 권한 확보
- [ ] Anthropic Claude API 키 발급
- [ ] smaXtec API 계정 확보 (D2O Corp 협조)
- [ ] data.go.kr 공공데이터 활용신청
- [ ] 로컬 개발 환경 (Node.js, pnpm, Docker) 설치
- [ ] Railway + Netlify 배포 권한 협의

---

**문서 끝**
