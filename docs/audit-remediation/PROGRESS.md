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
| DI-03 smaXtec 시각 +9h | 🟡 부분 | 3555a5e | 누락·오류·미래 시각 표시. 시간대 해석 변경은 운영 원본 샘플 확인 후 (검증 보류) |
| DI-04 수집 기준점 | ✅ | 3192a42 | smaxtec-org-cursor.test.ts |
| DI-05 동기화 덮어쓰기 | ✅ | 79f7308 | animal-affiliation.test.ts |
| DI-06 산차 이중 계산 | ✅ | cad0cf7 | animal-affiliation.test.ts |
| DI-07 진료기록 트랜잭션 | ✅ | c3c98a9 | treatment-transaction.test.ts |
| DI-08 개체 중복 | ✅ | f02af81 | 마이그레이션 0039(중복 시 보류) — 배포 승인 대상 |
| DI-09 센서 중복 | ✅(코드) | 9a332e3 | 유니크 인덱스는 운영 중복 정리 후 (승인 대기) |
| AI-01 질문→진료기록 | ✅ | f608913 | chat-learner-no-autowrite.test.ts |
| AI-02 미검증 학습 레이블 | ✅ | d2c69ce | auto-labeler-matched.test.ts |
| AI-03 합성 센서값 | ✅ | cb855d7 | sensor-chart-simulation.test.ts |
| OPS-01 ~ OPS-07 | ⬜ | | |

## 승인·정책 대기 (코드로 해결 불가)
- 배포 시 `schema_migrations` 테이블 생성 (SEC-03)
- 기존 진료 기록 휴약 종료일 보정 (DI-01)
- 이동 개체 과거 기록 귀속 정책 (DI-02)
- DI-03: 운영 smaxtec_events.raw_data->>'event_ts' 샘플 확인 → 시간대 해석 결정
- DI-08: 운영 animals 중복(external_id·trace_id) 확인·정리 → 0039 인덱스 생성
- DI-09: 운영 sensor_measurements 중복 정리 → 유니크 인덱스
- AI-02: 옛 무차별 자동 레이블 데이터 정리 여부 (현재는 학습에서 제외만)
- SEC-22: 0033(비밀번호 해시)·0034(전화번호) 공개 저장소 노출 — 비밀번호 변경·저장소 비공개 여부

## 테스트 기준선
- CI 5단계(빌드 3종, server+shared vitest, web vitest) 통과 유지가 조건
- 루트 `npm test`의 `tests/server/*` 16건 실패는 기준 커밋부터 존재 — Phase 5에서 원인 분류·해결

## 이후 단계 (오류 수정·검증 완료 후 착수 — 2026-10-20 차세대 개발 지시서)
- 2장 대화형 AI 중심 UI 간소화, 3장 역할별 워크스페이스(목장주·수의사 다목장·행정·방역),
  4장 범용 대화 AI 품질 원인 분석, 5장 데이터 출처 추적(실측/계산/추정/시뮬레이션 구분),
  6장 대화형 업무 실행, 7장 음성 고도화, 8장 KPI 정의서
- 원칙: 기존 기능 보존 우선, 오류 77건 정리 이후 진행
