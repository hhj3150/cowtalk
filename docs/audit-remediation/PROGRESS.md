# CowTalk AX 기술 감사(2026-10-20, 기준 694db91) 후속 수정 — 진행 기록

> 다음 세션은 이 파일부터 읽고 이어간다. 운영 배포·운영 DB 변경·실데이터 보정은 별도 승인 전 금지.
> 브랜치: `claude/exciting-gates-6zvts7` · PR: hhj3150/cowtalk#169 (Draft)

## 상태 표기
✅ 수정+회귀테스트+커밋 · 🟡 진행 중 · ⏸ 승인/정책 대기 · ⬜ 미착수

## P0 (5/5)
| ID | 상태 | 커밋 | 회귀 테스트 |
|---|---|---|---|
| SEC-01 SQL 인젝션·타 목장 비교 | ✅ | d7b42f1 | api/routes/__tests__/farm-comparison-scope.test.ts (9) |
| SEC-02 smaXtec 디버그 API | ✅ | 2e62209 | api/routes/__tests__/smaxtec-notes.guard.test.ts (7) |
| SEC-03 소유자 판정·마이그레이션 재실행 | ✅ | d577415 | db/__tests__/auto-migrate.test.ts, approval.service.test.ts, user-patch.guard.test.ts (17) |
| DI-01 휴약 KST·약품별 | ✅ | b8cd89b | services/vet/__tests__/withdrawal-calculator.test.ts (10) |
| DI-02 목장 이동 개체 | ✅ | 1b57e54 | pipeline/__tests__/animal-affiliation.test.ts (9) |

## P1
| ID | 상태 | 커밋 | 비고 |
|---|---|---|---|
| VO-01 맥락 텍스트로 승인 판정 | ✅ | a5d2e94 | userText 분리 |
| VO-02 부정문 승인 오판 | ✅ | a5d2e94 | write-confirmation.test.ts |
| VO-03 개체번호 STT 보정 | ✅ | 7ca9b17 | stt-correction.test.ts |
| SEC-04 방역 API 무인증 | ✅ | 5a29163 | epidemic.guard.test.ts |
| SEC-05 /admin 권한 | ✅ | 2717d69 | admin-users.guard.test.ts |
| SEC-06 사용자 목록 개인정보 | ✅ | 2717d69 | admin-users.guard.test.ts |
| SEC-07 마스터 토큰·자기 배정 | ✅ | 2717d69 | admin-users.guard.test.ts |
| SEC-08 번식 API 타 목장 | ✅ | 4a71a70 | breeding-scope.guard.test.ts |
| SEC-09 기록 API 본문 farmId | ✅ | 4d80d51 | write-scope.guard.test.ts |
| SEC-10 AI 목장 요약 검색 | ✅ | 035302a | farm-summary-scope.test.ts |
| SEC-11 UUID 형식 우회 | ✅ | 035302a | tool-scope.test.ts |
| DI-03 ~ DI-09 | ⬜ | | |
| AI-01 ~ AI-03 | ⬜ | | |
| OPS-01 ~ OPS-07 | ⬜ | | |

## 승인·정책 대기 (코드로 해결 불가)
- 배포 시 `schema_migrations` 테이블 생성 (SEC-03)
- 기존 진료 기록 휴약 종료일 보정 (DI-01)
- 이동 개체 과거 기록 귀속 정책 (DI-02)
- SEC-22: 0033(비밀번호 해시)·0034(전화번호) 공개 저장소 노출 — 비밀번호 변경·저장소 비공개 여부

## 테스트 기준선
- CI 5단계(빌드 3종, server+shared vitest, web vitest) 통과 유지가 조건
- 루트 `npm test`의 `tests/server/*` 16건 실패는 기준 커밋부터 존재 — Phase 5에서 원인 분류·해결

## 이후 단계 (오류 수정·검증 완료 후 착수 — 2026-10-20 차세대 개발 지시서)
- 2장 대화형 AI 중심 UI 간소화, 3장 역할별 워크스페이스(목장주·수의사 다목장·행정·방역),
  4장 범용 대화 AI 품질 원인 분석, 5장 데이터 출처 추적(실측/계산/추정/시뮬레이션 구분),
  6장 대화형 업무 실행, 7장 음성 고도화, 8장 KPI 정의서
- 원칙: 기존 기능 보존 우선, 오류 77건 정리 이후 진행
