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

4층 — Intelligence Loop:
  피드백 → 정확도 추적 → 프롬프트 개선 (모델 재학습 아님)

핵심 원칙:
- smaXtec 이벤트는 재판단하지 않음 (95%+ 정확도 신뢰)
- Claude API가 핵심 해석 엔진
- v4 룰 엔진은 Claude 불가 시 fallback + 보조 분석
- 모든 해석에 explanation + contributingFactors + roleSpecific 필수

## 보고 형식 (매 작업 후)

1. 분석한 것
2. 보존한 것 (v4에서 이식한 로직)
3. 구현한 것
4. 변경된 파일 목록
5. 테스트 결과
6. 아직 누락된 것
7. 다음 안전한 단계
