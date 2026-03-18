######################################################################
# CowTalk v5.0 — Complete Renewal Blueprint
# 축산 디지털 운영체제 완전 재설계
#
# 작성: CTO 관점 전면 재설계
# 기반: v4.0 (75K LOC) 실운영 경험 + 하원장님 도메인 지식
# 목표: 프로덕션 레벨, 국가 플랫폼 스케일, 투자 유치 가능
######################################################################


======================================================================
PART 1. v4.0에서 배운 것 — 무엇을 살리고 무엇을 바꾸는가
======================================================================

v4.0의 강점 (반드시 유지):
- 19-Layer 아키텍처 개념 → 유지하되 구현 방식 개선
- Data Spine 원칙 (AI가 우회하지 않음) → 강화
- 6개 AI 엔진 도메인 로직 → 그대로 이식
- 역할별 뷰 분리 (6역할) → 컴포넌트 설계 개선
- Decision Fusion (경합 해석) → 핵심 유지
- 설명 가능한 AI → 강화
- 141개 농장 smaXtec 실연결 → 유지
- CowTalk Chat 개념 → 강화
- 드릴다운 3단계 패턴 → 설계에 내재화

v4.0의 구조적 약점 (반드시 해결):
- server/index.js 2,500줄 모놀리스 → 모듈 라우터 분리
- 인메모리 중심 → DB-first 설계
- JavaScript 무타입 → TypeScript 전면 도입
- 테스트 후순위 → 테스트 우선 개발
- 프론트 상태관리 Context만 → Zustand + React Query
- API 비표준 → RESTful + OpenAPI 명세
- 환경설정 산재 → 중앙 Config 관리
- 로깅/모니터링 부재 → 구조화 로깅 + 헬스 대시보드
- 에러핸들링 비표준 → 글로벌 에러 체계


======================================================================
PART 2. 기술 스택 결정
======================================================================

프론트엔드:
- React 18 + TypeScript
- Vite 6 (빌드)
- Tailwind CSS 4
- Zustand (전역 상태)
- TanStack React Query (서버 상태/캐시)
- Recharts (차트)
- Leaflet + react-leaflet (지도)
- React Router 7
- Zod (런타임 타입 검증)

백엔드:
- Node.js + Express 5 + TypeScript
- Zod (요청/응답 스키마 검증)
- PostgreSQL 16 + TimescaleDB (시계열)
- Redis (캐시 + 실시간 상태)
- Drizzle ORM (타입 안전 DB 접근)
- Pino (구조화 로깅)
- Bull (작업 큐 — 배치 분석)
- Socket.IO (실시간 푸시)

AI 레이어:
- 룰 엔진 (v4 로직 이식) + ML 어댑터 (향후)
- Anthropic Claude API (CowTalk Chat)

인프라:
- Docker Compose (개발/스테이징)
- GitHub Actions CI/CD
- Vitest (테스트)


======================================================================
PART 3. 프로젝트 구조 — 완전 새 설계
======================================================================

cowtalk/
├── README.md
├── CLAUDE.md                        # Claude Code 지침서
├── API_DOCS.md                      # OpenAPI 기반 문서
├── docker-compose.yml               # 개발용
├── docker-compose.prod.yml          # 프로덕션용
├── .env.example
├── .github/
│   └── workflows/
│       ├── ci.yml                   # lint + test + build
│       └── deploy.yml               # 프로덕션 배포
│
├── packages/                        # 모노레포 구조
│   │
│   ├── shared/                      # 프론트+백 공유 타입
│   │   ├── package.json
│   │   └── src/
│   │       ├── types/
│   │       │   ├── animal.ts        # Animal, AnimalStatus
│   │       │   ├── farm.ts          # Farm, FarmSummary
│   │       │   ├── sensor.ts        # SensorReading, SensorFeatures
│   │       │   ├── prediction.ts    # Prediction, Explanation
│   │       │   ├── alert.ts         # Alert, AlertPriority
│   │       │   ├── action.ts        # ActionPlan, Recommendation
│   │       │   ├── feedback.ts      # Feedback, OutcomeRecord
│   │       │   ├── user.ts          # User, Role, Permission
│   │       │   └── regional.ts      # RegionalSummary, FarmCluster
│   │       ├── constants/
│   │       │   ├── roles.ts         # 6역할 정의 + 권한 매트릭스
│   │       │   ├── engines.ts       # AI 엔진 ID, 라벨
│   │       │   └── thresholds.ts    # 기본 임계값 (오버라이드 가능)
│   │       └── schemas/
│   │           ├── prediction.ts    # Zod 스키마 — 예측 출력 검증
│   │           ├── alert.ts         # Zod 스키마 — 알림 출력 검증
│   │           └── api.ts           # Zod 스키마 — API 요청/응답
│   │
│   ├── server/                      # 백엔드
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.ts             # 앱 시작점 (깔끔, 50줄 이내)
│   │       ├── app.ts               # Express 앱 구성
│   │       ├── config/
│   │       │   ├── index.ts         # 중앙 설정 (환경변수 → 타입 객체)
│   │       │   ├── database.ts      # DB 연결 설정
│   │       │   └── redis.ts         # Redis 설정
│   │       │
│   │       ├── db/
│   │       │   ├── schema.ts        # Drizzle 스키마 정의
│   │       │   ├── migrate.ts       # 마이그레이션 실행기
│   │       │   ├── migrations/      # SQL 마이그레이션 파일
│   │       │   ├── seed.ts          # 초기 데이터 (사용자, 역할)
│   │       │   └── repositories/
│   │       │       ├── animal.repo.ts
│   │       │       ├── farm.repo.ts
│   │       │       ├── sensor.repo.ts
│   │       │       ├── prediction.repo.ts
│   │       │       ├── alert.repo.ts
│   │       │       ├── feedback.repo.ts
│   │       │       ├── breeding.repo.ts
│   │       │       ├── health.repo.ts
│   │       │       └── regional.repo.ts
│   │       │
│   │       ├── api/
│   │       │   ├── index.ts         # 라우터 등록 (50줄 이내)
│   │       │   ├── middleware/
│   │       │   │   ├── auth.ts      # JWT 인증
│   │       │   │   ├── rbac.ts      # 역할 기반 접근 제어
│   │       │   │   ├── validate.ts  # Zod 요청 검증
│   │       │   │   ├── error.ts     # 글로벌 에러 핸들러
│   │       │   │   └── logger.ts    # 요청 로깅
│   │       │   ├── routes/
│   │       │   │   ├── auth.routes.ts
│   │       │   │   ├── farm.routes.ts
│   │       │   │   ├── animal.routes.ts
│   │       │   │   ├── sensor.routes.ts
│   │       │   │   ├── dashboard.routes.ts    # 역할별 대시보드
│   │       │   │   ├── ai.routes.ts           # AI 분석 결과
│   │       │   │   ├── alert.routes.ts
│   │       │   │   ├── action.routes.ts       # 액션 플랜
│   │       │   │   ├── feedback.routes.ts
│   │       │   │   ├── breeding.routes.ts
│   │       │   │   ├── health.routes.ts
│   │       │   │   ├── regional.routes.ts
│   │       │   │   ├── chat.routes.ts         # CowTalk Chat
│   │       │   │   ├── export.routes.ts       # CSV/Excel
│   │       │   │   ├── admin.routes.ts        # 사용자/시스템 관리
│   │       │   │   └── public-data.routes.ts  # 공공데이터
│   │       │   └── dto/                       # 각 라우트별 요청/응답 DTO
│   │       │
│   │       ├── pipeline/              # Data Spine 구현
│   │       │   ├── orchestrator.ts    # 파이프라인 조율 (스케줄링)
│   │       │   ├── connectors/
│   │       │   │   ├── smaxtec.connector.ts   # smaXtec API 연결
│   │       │   │   ├── public-data.connector.ts
│   │       │   │   ├── weather.connector.ts
│   │       │   │   └── base.connector.ts      # 커넥터 인터페이스
│   │       │   ├── ingestion.ts
│   │       │   ├── validation.ts
│   │       │   ├── normalization.ts
│   │       │   └── storage.ts         # 정규화된 데이터 → DB 저장
│   │       │
│   │       ├── feature-store/
│   │       │   ├── index.ts
│   │       │   ├── extractor.ts       # 피처 계산 엔진
│   │       │   ├── registry.ts        # 피처 메타데이터
│   │       │   ├── storage.ts         # 피처 저장/조회
│   │       │   └── versioning.ts      # 피처 버전 관리
│   │       │
│   │       ├── ai-brain/              # AI 두뇌
│   │       │   ├── index.ts           # AI 오케스트레이터
│   │       │   ├── engines/
│   │       │   │   ├── base.engine.ts          # 엔진 인터페이스
│   │       │   │   ├── estrus.engine.ts        # 발정 감지
│   │       │   │   ├── disease.engine.ts       # 질병 경고
│   │       │   │   ├── pregnancy.engine.ts     # 임신 예측
│   │       │   │   ├── herd.engine.ts          # 군집 이상
│   │       │   │   └── regional.engine.ts      # 지역 인텔리전스
│   │       │   ├── fusion/
│   │       │   │   ├── decision-fusion.ts      # 경합 해석 해소
│   │       │   │   └── priority-ranker.ts      # 우선순위 랭킹
│   │       │   ├── explanation/
│   │       │   │   ├── explainer.ts            # 설명 생성기
│   │       │   │   └── role-formatter.ts       # 역할별 설명 수준
│   │       │   ├── action/
│   │       │   │   ├── action-engine.ts        # 액션 플랜 생성
│   │       │   │   └── role-action.ts          # 역할별 액션 분배
│   │       │   └── alert/
│   │       │       ├── alert-manager.ts        # 알림 생성/중복방지
│   │       │       └── notification.ts         # 외부 알림 (이메일/SMS)
│   │       │
│   │       ├── intelligence-loop/     # 폐루프 학습
│   │       │   ├── feedback-collector.ts
│   │       │   ├── outcome-recorder.ts
│   │       │   ├── model-evaluator.ts
│   │       │   ├── threshold-learner.ts
│   │       │   └── model-registry.ts
│   │       │
│   │       ├── chat/                  # CowTalk Chat
│   │       │   ├── chat-service.ts    # Claude API 통합
│   │       │   ├── context-builder.ts # 플랫폼 데이터 → 프롬프트
│   │       │   ├── query-engine.ts    # 구조화된 질의 처리
│   │       │   └── role-tone.ts       # 역할별 응답 톤
│   │       │
│   │       ├── serving/               # 서빙 레이어
│   │       │   ├── dashboard.service.ts   # 역할별 대시보드 데이터
│   │       │   ├── animal-status.service.ts
│   │       │   ├── farm-summary.service.ts
│   │       │   ├── regional-map.service.ts
│   │       │   └── cache.service.ts       # Redis 캐시 관리
│   │       │
│   │       └── lib/                   # 유틸리티
│   │           ├── logger.ts          # Pino 구조화 로깅
│   │           ├── errors.ts          # 커스텀 에러 클래스
│   │           ├── auth.ts            # JWT 발급/검증
│   │           └── date.ts            # 날짜/시간대 유틸
│   │
│   └── web/                           # 프론트엔드
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx                # 라우팅만 (깔끔)
│           │
│           ├── stores/                # Zustand 상태
│           │   ├── auth.store.ts      # 인증/사용자/역할
│           │   ├── farm.store.ts      # 선택된 농장
│           │   ├── drilldown.store.ts # 드릴다운 상태
│           │   └── notification.store.ts
│           │
│           ├── hooks/                 # 커스텀 훅
│           │   ├── useAuth.ts
│           │   ├── useDashboard.ts    # React Query — 대시보드 데이터
│           │   ├── useAnimal.ts       # React Query — 개체 상세
│           │   ├── useSensor.ts       # React Query — 센서 데이터
│           │   ├── useAlerts.ts
│           │   ├── useActions.ts
│           │   ├── useFeedback.ts
│           │   ├── useRegionalMap.ts
│           │   ├── useDrilldown.ts
│           │   └── useAutoRefresh.ts  # 자동 갱신 (5분)
│           │
│           ├── api/                   # API 클라이언트
│           │   ├── client.ts          # Axios 인스턴스 + 인터셉터
│           │   ├── auth.api.ts
│           │   ├── dashboard.api.ts
│           │   ├── animal.api.ts
│           │   ├── sensor.api.ts
│           │   ├── ai.api.ts
│           │   ├── alert.api.ts
│           │   ├── feedback.api.ts
│           │   ├── chat.api.ts
│           │   ├── regional.api.ts
│           │   └── export.api.ts
│           │
│           ├── components/            # 공유 컴포넌트
│           │   ├── layout/
│           │   │   ├── AppShell.tsx    # 사이드바+헤더+콘텐츠
│           │   │   ├── Sidebar.tsx
│           │   │   ├── Header.tsx
│           │   │   └── MobileNav.tsx
│           │   ├── data/
│           │   │   ├── KpiCard.tsx     # 클릭 가능한 KPI (드릴다운 내장)
│           │   │   ├── DataTable.tsx   # 정렬/필터/페이지네이션
│           │   │   ├── SensorChart.tsx # 시계열 차트 (24h/7d/30d)
│           │   │   ├── AlertCard.tsx   # 알림 + 빠른 피드백 버튼
│           │   │   └── ExportButton.tsx
│           │   ├── ai/
│           │   │   ├── AiInsightPanel.tsx    # 역할별 AI 인사이트
│           │   │   ├── FusionPanel.tsx       # Decision Fusion 결과
│           │   │   ├── ActionCard.tsx        # 액션 추천 + 피드백
│           │   │   └── ExplanationBadge.tsx  # 설명 팝오버
│           │   ├── drilldown/
│           │   │   ├── DrilldownOverlay.tsx  # 오버레이 컨테이너
│           │   │   ├── AnimalList.tsx        # 동물 목록 (검색/필터)
│           │   │   ├── FarmList.tsx          # 농장 목록
│           │   │   ├── AnimalDetail.tsx      # 개체 상세 (역할별 뷰)
│           │   │   └── Breadcrumb.tsx        # 요약>농장>동물>상세
│           │   ├── chat/
│           │   │   ├── ChatDrawer.tsx        # 글로벌 플로팅 채팅
│           │   │   ├── ChatMessage.tsx
│           │   │   └── SuggestedQuestions.tsx
│           │   ├── feedback/
│           │   │   ├── FeedbackButtons.tsx   # 역할별 피드백
│           │   │   └── QuickFeedback.tsx     # 알림/액션 인라인 피드백
│           │   ├── map/
│           │   │   ├── RegionalMap.tsx       # Leaflet 지도
│           │   │   ├── FarmMarker.tsx        # 상태별 마커
│           │   │   └── FarmDrawer.tsx        # 농장 사이드패널
│           │   └── common/
│           │       ├── LoadingSkeleton.tsx
│           │       ├── ErrorFallback.tsx     # 에러 시 안내+재시도
│           │       ├── EmptyState.tsx        # 데이터 없음 안내
│           │       ├── LastUpdated.tsx       # "최종 업데이트: 14:32"
│           │       └── Badge.tsx
│           │
│           └── pages/                 # 페이지 (역할별)
│               ├── auth/
│               │   └── LoginPage.tsx
│               ├── dashboard/         # 역할별 대시보드
│               │   ├── FarmerDashboard.tsx
│               │   ├── VetDashboard.tsx
│               │   ├── InseminatorDashboard.tsx
│               │   ├── AdminDashboard.tsx
│               │   ├── QuarantineDashboard.tsx
│               │   └── FeedCompanyDashboard.tsx
│               ├── regional/
│               │   ├── RegionalMapPage.tsx
│               │   └── QuarantineCommandPage.tsx
│               ├── intelligence/
│               │   ├── AiPerformancePage.tsx
│               │   └── BreedingProgramPage.tsx
│               ├── admin/
│               │   ├── UserManagementPage.tsx
│               │   └── SystemStatusPage.tsx
│               └── demo/
│                   └── DemoModePage.tsx

└── tests/                             # 테스트 (프로젝트 루트)
    ├── server/
    │   ├── ai-brain/
    │   │   ├── estrus.engine.test.ts
    │   │   ├── disease.engine.test.ts
    │   │   ├── pregnancy.engine.test.ts
    │   │   ├── decision-fusion.test.ts
    │   │   └── action-engine.test.ts
    │   ├── pipeline/
    │   │   ├── smaxtec.connector.test.ts
    │   │   ├── validation.test.ts
    │   │   └── normalization.test.ts
    │   ├── feature-store/
    │   │   └── extractor.test.ts
    │   ├── intelligence-loop/
    │   │   └── feedback-collector.test.ts
    │   └── api/
    │       ├── auth.routes.test.ts
    │       └── dashboard.routes.test.ts
    └── web/
        ├── components/
        │   ├── KpiCard.test.tsx
        │   ├── DrilldownOverlay.test.tsx
        │   └── AnimalDetail.test.tsx
        └── pages/
            └── FarmerDashboard.test.tsx


======================================================================
PART 4. DB 스키마 — 처음부터 제대로
======================================================================

핵심 변경:
- Drizzle ORM으로 타입 안전 스키마 정의
- TimescaleDB hypertable 명시적 설정
- 모든 FK에 인덱스
- soft delete (deleted_at) 전면 적용
- audit trail (created_by, updated_by) 전면 적용

도메인별 테이블:

A. 조직/농장:
- regions (시도, 시군구)
- farms (farm_id, region_id, name, address, lat, lng, status)
- farm_groups (그룹핑)

B. 동물:
- animals (animal_id, farm_id, ear_tag, breed, birth_date, parity, sex, status)
- animal_status_history (상태 변경 이력)

C. 센서:
- sensor_devices (device_id, animal_id, device_type, install_date)
- sensor_measurements (hypertable — animal_id, timestamp, metric_type, value)
- sensor_hourly_agg (hypertable — 시간별 집계)
- sensor_daily_agg (hypertable — 일별 집계)

D. 번식:
- breeding_events (animal_id, event_date, type, semen_info, technician)
- pregnancy_checks (animal_id, check_date, result, method)
- calving_events (animal_id, calving_date, calf_info, complications)

E. 건강:
- health_events (animal_id, event_date, diagnosis, severity)
- treatments (health_event_id, drug, dosage, withdrawal_days)
- vet_visits (farm_id, vet_id, visit_date, notes)

F. 생산:
- milk_records (animal_id, date, yield, fat, protein, scc)
- lactation_records (animal_id, lactation_number, start, end, total)

G. 피처:
- animal_features (animal_id, timestamp, feature_name, value, version)
- feature_definitions (name, description, source, calculation, engine_usage)

H. AI 예측:
- predictions (prediction_id, engine_type, animal_id, farm_id, timestamp,
              probability, confidence, severity, rank_score,
              prediction_label, explanation_text, recommended_action,
              model_version, feature_snapshot_id)
- model_registry (model_id, engine_type, model_type, version, metrics, is_active)

I. 알림:
- alerts (alert_id, alert_type, animal_id, farm_id, prediction_id,
         priority, status, explanation, recommended_action)
- alert_history (상태 변경 이력)
- notification_log (발송 이력 — 채널, 수신자, 시각, 성공여부)

J. 피드백:
- feedback (feedback_id, prediction_id, alert_id, animal_id, farm_id,
           feedback_type, feedback_value, source_role, recorded_by, notes)
- outcome_evaluations (prediction_id, actual_outcome, is_correct, evaluated_at)

K. 사용자:
- users (user_id, name, email, password_hash, role, status)
- user_farm_access (user_id, farm_id, permission_level)
- audit_log (user_id, action, resource, timestamp)

L. 지역:
- regional_daily_summary (region_id, date, metrics JSON)
- farm_daily_summary (farm_id, date, metrics JSON)

M. 파이프라인 감사:
- data_sources (source_id, source_type, config, status)
- ingestion_runs (run_id, source_id, started_at, completed_at, records_count, status)


======================================================================
PART 5. AI Brain 재설계 — Data Integration + Claude AI Interpretation
======================================================================

핵심 전환: 6개 룰 엔진 병렬 실행 → smaXtec 신뢰 + Claude API 해석

■ 4층 아키텍처

1층 Data Integration (데이터 통합):
  - smaXtec 이벤트: 발정, 질병, 섭식이상 등 → 재판단 없이 신뢰 (95%+)
  - 센서 원시 데이터: 체온, 활동량, 반추 → 보조 지표로 활용
  - 공공데이터: 기상, 질병발생, 도축정보 → 맥락 보강
  - 농장기록: 번식, 진료, 착유 → 개체 이력
  → 이 모든 것을 통합한 AnimalProfile 생성

2층 Claude AI Interpretation (AI 해석):
  - AnimalProfile → Claude API 호출
  - Claude가 수행하는 것:
    a) 맥락 해석: smaXtec 이벤트의 의미를 농장 상황에 맞게 해석
    b) 우선순위 판단: 여러 이벤트 간 긴급도 결정
    c) 역할별 액션 생성: 6개 역할 각각에 맞는 구체적 행동 지침
    d) 자연어 설명: 왜 이런 판단인지 사람이 이해할 수 있는 설명
  - v4 룰 엔진 결과를 "보조 분석(context hints)"으로 프롬프트에 포함
  - Fallback: Claude API 불가 시 v4 룰 엔진이 대체 분석 수행

3층 Role-Based Serving (역할별 제공):
  - farmer: 오늘 할 일, 긴급 알림, 수익 영향
  - veterinarian: 진료 우선순위, 진단 근거, 처치 권고
  - inseminator: 수정 적기, 성공률 예측, 스케줄
  - government_admin: 지역 통계, 방역 현황, 정책 지표
  - quarantine_officer: 질병 확산 위험, 격리 대상, 이동 제한
  - feed_company: 사료 효율, 영양 상태, 공급 계획

4층 Intelligence Loop (학습 루프):
  - 수의사/농장주 피드백 수집
  - 예측 정확도 추적 (precision/recall)
  - 프롬프트 개선 (모델 재학습이 아닌 프롬프트 엔지니어링)
  - 임계값 자동 조정 (v4 Threshold Learner 계승)

■ v4 룰 엔진의 역할 변경

기존: 핵심 분석 엔진 (6개 병렬 실행 → Decision Fusion)
변경: 보조 분석 + Fallback
  - Claude 호출 시 context hints로 포함 (예: "v4 발정 엔진: 확률 0.82")
  - Claude API 장애 시 독립적으로 분석 결과 제공
  - 기존 인터페이스(analyze, explain, recommend) 유지

■ 핵심 변경 요약
1. smaXtec 이벤트를 재판단하지 않음 → 신뢰 기반 설계
2. Claude API가 핵심 해석 엔진 → 자연어 설명 + 역할별 액션
3. v4 엔진은 보조/fallback → 완전 폐기하지 않음
4. Intelligence Loop = 프롬프트 개선 → 모델 재학습 불필요


======================================================================
PART 6. Data Spine 재설계 — 실시간 + 배치 분리
======================================================================

실시간 경로 (Near-Realtime):
smaXtec API (5분 주기)
  → smaxtec.connector.ts (인증, 재시도, 에러 복구)
  → ingestion.ts (원시 데이터 기록)
  → validation.ts (범위 검증, 이상값 감지)
  → normalization.ts (표준 포맷 변환)
  → storage.ts (TimescaleDB 저장)
  → extractor.ts (피처 계산)
  → v4-engines/ (보조 분석, context hints 생성)
  → claude-interpreter.ts (Claude API 해석, fallback 시 v4 결과 사용)
  → action-engine.ts (액션 생성)
  → alert-manager.ts (알림 생성/중복방지)
  → Redis 캐시 업데이트
  → Socket.IO 푸시 (프론트 실시간 업데이트)

배치 경로 (Daily/Weekly):
- 일별 집계 (sensor_daily_agg)
- 농장 일일 요약 (farm_daily_summary)
- 지역 일일 요약 (regional_daily_summary)
- Intelligence Loop 평가 (precision/recall 계산)
- Threshold Learner 분석
- 훈련 데이터 내보내기 (향후 ML용)

핵심 변경:
1. 모든 데이터가 DB를 거침 (인메모리 중심 → DB-first)
2. Redis가 캐시 역할 (조회 성능)
3. Socket.IO로 실시간 푸시 (polling 대신)
4. Bull 큐로 배치 작업 스케줄링


======================================================================
PART 7. 프론트엔드 재설계 — 드릴다운 네이티브
======================================================================

핵심 변경:

1. 드릴다운이 설계에 내재화:
   - KpiCard 컴포넌트에 onClick → drilldown이 기본 내장
   - 별도 연결 코드 불필요
   - KpiCard({ label: "건강이상", value: 5, drilldownType: "health_risk" })
   - 클릭하면 자동으로 DrilldownOverlay → AnimalList → AnimalDetail

2. React Query로 서버 상태 관리:
   - 5분 자동 갱신 (staleTime: 5분)
   - 백그라운드 리페치 (사용자가 느끼지 못하는 업데이트)
   - 캐시 → 오프라인 지원 가능성
   - 로딩/에러/빈상태 자동 처리

3. Zustand로 클라이언트 상태:
   - 인증/역할 → auth.store
   - 선택된 농장 → farm.store
   - 드릴다운 상태 → drilldown.store
   - Context 지옥 탈출

4. 역할별 대시보드 조합:
   - 각 대시보드는 공유 컴포넌트의 조합
   - FarmerDashboard = KpiRow + TodoList + SensorOverview + AiInsightPanel
   - VetDashboard = KpiRow + HealthRanking + FusionPanel + SensorDetail
   - 새 역할 추가 시 기존 컴포넌트 조합만으로 가능

5. ErrorBoundary + EmptyState + LoadingSkeleton:
   - 모든 데이터 섹션에 3가지 상태가 기본 내장
   - 빈 .catch(() => {}) 불가능한 구조


======================================================================
PART 8. 보안 — 처음부터 프로덕션 수준
======================================================================

1. 인증:
   - JWT access token (15분) + refresh token (7일)
   - refresh token은 httpOnly cookie
   - 로그아웃 시 refresh token DB에서 무효화

2. 인가 (RBAC):
   - 역할 × 리소스 × 액션 매트릭스 (shared/constants/roles.ts)
   - rbac.ts 미들웨어가 모든 라우트에 자동 적용
   - 역할별 농장 접근 범위 제어

3. API 보안:
   - Helmet (HTTP 헤더)
   - CORS (화이트리스트 도메인)
   - Rate Limiting (역할별 차등)
   - 요청 크기 제한
   - SQL 인젝션: Drizzle ORM 파라미터 바인딩
   - XSS: 입력 sanitize + CSP

4. 비밀 관리:
   - .env → config/index.ts 타입 검증 (Zod)
   - 프론트엔드에 VITE_PUBLIC_ 접두사만 노출
   - smaXtec/Anthropic 키는 서버에만

5. 감사:
   - audit_log 테이블에 중요 행동 기록
   - 로그인, 데이터 변경, 알림 확인, 피드백 입력


======================================================================
PART 9. 개발 순서 — Phase 0부터
======================================================================

Phase 0: 프로젝트 세팅 [1일]
- 모노레포 구조 생성 (packages/shared, server, web)
- TypeScript 설정
- ESLint + Prettier
- Vitest 설정
- Docker Compose (PostgreSQL + TimescaleDB + Redis)
- GitHub Actions CI
- CLAUDE.md 배치

Phase 1: 공유 타입 + DB [2일]
- shared/types/ 전체 정의
- shared/schemas/ Zod 검증
- Drizzle 스키마 + 마이그레이션
- 기본 Repository 구현
- seed 데이터 (6역할 사용자)

Phase 2: 인증 + API 골격 [1일]
- JWT 인증 (access + refresh)
- RBAC 미들웨어
- 라우트 골격 (빈 핸들러)
- 글로벌 에러 핸들러
- 구조화 로깅

Phase 3: Data Spine [3일]
- smaXtec 커넥터 (v4 로직 이식)
- 파이프라인 (ingestion → validation → normalization → storage)
- TimescaleDB 실저장
- Redis 캐시
- 파이프라인 오케스트레이터 (5분 주기)

Phase 4: Feature Store [1일]
- 피처 계산 엔진 (v4 featureExtractor 이식)
- 피처 레지스트리
- 피처 DB 저장

Phase 5: AI Brain [3일]
- base.engine.ts 인터페이스
- 5개 엔진 (v4 로직 이식 + TypeScript + 테스트)
- Decision Fusion (v4 로직 이식)
- Action Engine
- Alert Manager
- 각 엔진 테스트 작성 (TDD)

Phase 6: 서빙 레이어 [1일]
- 역할별 대시보드 API
- 동물 상세 API
- 지역 맵 API
- Redis 캐시 서빙

Phase 7: 프론트엔드 골격 [2일]
- AppShell (사이드바, 헤더, 라우팅)
- Zustand 스토어
- React Query 훅
- API 클라이언트
- 공통 컴포넌트 (KpiCard, DataTable, SensorChart, AlertCard)
- 드릴다운 컴포넌트 (DrilldownOverlay, AnimalList, AnimalDetail)
- ErrorFallback, EmptyState, LoadingSkeleton

Phase 8: 6개 대시보드 [3일]
- FarmerDashboard (컴포넌트 조합)
- VetDashboard
- InseminatorDashboard
- AdminDashboard
- QuarantineDashboard
- FeedCompanyDashboard
- 모든 KPI → 드릴다운 자동 연결
- 역할별 뷰 차이 확인

Phase 9: CowTalk Chat [1일]
- Claude API 통합
- 컨텍스트 빌더 (플랫폼 데이터 주입)
- 역할별 톤
- ChatDrawer 글로벌 통합
- SSE 스트리밍

Phase 10: Regional Map [1일]
- Leaflet 지도 + 141 마커
- 4 시각화 모드
- 농장 드로어 + 드릴다운
- KPI 드릴다운
- 정책 브리핑

Phase 11: Intelligence Loop + 피드백 [1일]
- 피드백 수집기
- 결과 매칭
- 정확도 평가
- 피드백 UI (역할별 버튼)
- AI 성능 리포트

Phase 12: 운영 기능 [2일]
- 사용자 CRUD
- CSV/Excel 내보내기
- 이메일/SMS 알림 (구조)
- 시스템 상태 대시보드
- 데모 모드

Phase 13: 배포 + 문서 [1일]
- Docker 프로덕션 설정
- 배포 가이드
- 사용자 매뉴얼
- API 문서

총 예상: 23일 (하루 6~8시간)


======================================================================
PART 10. v4 → v5 마이그레이션 전략
======================================================================

v4 코드를 버리는 것이 아니라, 핵심 로직을 이식한다:

1. AI 엔진 6개:
   - v4 JavaScript 로직 → v5 TypeScript engine으로 1:1 이식
   - 임계값, 규칙, 가중치 그대로 유지
   - 인터페이스만 통일 (base.engine.ts 구현)

2. smaXtec 커넥터:
   - API 호출 로직 그대로 이식
   - 에러 처리/재시도 강화

3. 공공데이터 연동:
   - publicDataApi.js → public-data.connector.ts 이식

4. CowTalk 질의 엔진:
   - cowtalk/ 16,047 LOC의 핵심 로직 → chat/query-engine.ts 이식
   - 불필요한 코드 정리

5. 프론트엔드:
   - 대시보드 레이아웃/UX 설계 유지
   - JSX → TSX 전환
   - Context → Zustand 전환
   - fetch → React Query 전환
   - 컴포넌트 분리 강화

v4는 프로토타입이 아니라, v5의 설계서이자 검증된 도메인 로직의 원본이다.


======================================================================
PART 11. v5가 v4보다 나은 이유
======================================================================

| 항목 | v4 | v5 |
|------|-----|-----|
| 타입 안전성 | JS (런타임 에러) | TS (컴파일 에러) |
| API 서버 | index.js 2,500줄 | 라우트 파일 15개 × 100줄 |
| DB 접근 | raw SQL + 인메모리 fallback | Drizzle ORM 타입 안전 |
| 상태 관리 | Context (리렌더 지옥) | Zustand + React Query |
| 실시간 | polling 5분 | Socket.IO 푸시 |
| 캐시 | 인메모리 Map | Redis (분산 가능) |
| 테스트 | 후순위 (0 → 114) | 설계 내장 (TDD) |
| 드릴다운 | 후순위 추가 | 컴포넌트에 내장 |
| 에러 처리 | .catch(() => {}) | 글로벌 에러 체계 |
| 배포 | 미검증 | Docker + CI/CD 내장 |
| 확장성 | 모놀리스 | 모듈 분리 (향후 마이크로서비스) |
| 온보딩 | 1인 지식 | TypeScript + 문서 + 테스트 |


######################################################################
# 실행 방법
######################################################################
#
# 이 블루프린트를 CLAUDE.md와 함께 프로젝트에 넣고,
# Phase 0부터 순서대로 Claude Code에서 실행합니다.
#
# 각 Phase의 프롬프트:
#
# "CowTalk v5.0 CTO 모드로 작동하라.
#  CLAUDE.md와 RENEWAL_BLUEPRINT.md를 읽고 따르라.
#  Phase [N]을 구현하라.
#  블루프린트의 해당 섹션을 정확히 따르라.
#  v4 코드에서 [해당 파일]의 로직을 이식하라.
#  작업 완료 후 개발 보고 형식으로 보고하라."
#
######################################################################
