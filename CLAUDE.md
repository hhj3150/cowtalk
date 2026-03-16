######################################################################
# CLAUDE.md — CowTalk v5.0 Project Intelligence Instructions
######################################################################

## 프로젝트 정체성

CowTalk v5.0은 축산 디지털 운영체제(Livestock Digital Operating System)입니다.

핵심 공식:
smaXtec 위내센서 + 국가 공공데이터 + AI 해석 + 역할별 액션플랜 = 통합 플랫폼

이 플랫폼은 1개 농장 → 141개 농장 → 지역 → 국가로 확장됩니다.

## 기술 스택

- 언어: TypeScript (프론트 + 백엔드 + 공유 타입)
- 프론트: React 18 + Vite + Tailwind + Zustand + React Query
- 백엔드: Express 5 + Drizzle ORM + Pino + Bull + Socket.IO
- DB: PostgreSQL 16 + TimescaleDB + Redis
- AI: 룰 기반 6개 엔진 + Anthropic Claude (Chat)
- 테스트: Vitest
- 배포: Docker Compose + GitHub Actions

## 구조

모노레포: packages/shared, packages/server, packages/web
블루프린트: CowTalk_v5_Renewal_Blueprint.md 참조

## 핵심 규칙

1. 타입 안전: 모든 코드 TypeScript, any 금지
2. DB-first: 인메모리 중심 금지, 모든 데이터 DB 거침
3. 테스트 필수: 새 엔진/서비스 작성 시 테스트 함께
4. Data Spine 준수: AI가 파이프라인을 우회하지 않음
5. 설명 필수: 모든 예측에 explanation + contributingFeatures
6. 역할별 출력: roleSpecific 필드 필수
7. 드릴다운 내장: KpiCard는 클릭 가능이 기본값
8. 에러 처리: 빈 .catch() 금지, ErrorFallback 필수
9. 비파괴적: 작동 중인 기능을 깨지 마라
10. v4 이식: 도메인 로직은 v4에서 가져오되 구조는 v5 따름

## AI 엔진 인터페이스

모든 엔진은 base.engine.ts를 구현:
- analyze(input) → EngineOutput
- explain(output, role) → string
- recommend(output, role) → ActionRecommendation

EngineOutput 필수 필드:
predictionId, engineType, farmId, animalId, timestamp,
probability, confidence, severity, rankScore, predictionLabel,
explanationText, contributingFeatures, recommendedAction,
modelVersion, roleSpecific

## 보고 형식 (매 작업 후)

1. 분석한 것
2. 보존한 것 (v4에서 이식한 로직)
3. 구현한 것
4. 변경된 파일 목록
5. 테스트 결과
6. 아직 누락된 것
7. 다음 안전한 단계
