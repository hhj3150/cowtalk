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
| OPS-01 알람 순회 200 상한 | ✅ | 0e2c43b | sovereign-sweep.test.ts |
| OPS-02 /health/deep Redis | ✅ | 4514f57 | health-smaxtec.test.ts |
| OPS-03 전체 이력 재수집 | ⏸ 보류 | — | smaXtec API 기간 파라미터 미확인 (외부 API 호출 구조 변경 = 승인 사항) |
| OPS-04 잡 중복·알림톡 중복 | ✅ | 929d2c3 | 마이그레이션 0040 — 배포 승인 대상 |
| OPS-05 센서 수집 누락 | ✅ | 6ec2c24 | sensor-dedupe.test.ts |
| OPS-06 핫패스 인덱스 | ✅ | 129cca4 | 마이그레이션 0041 — 배포 승인 대상 |
| OPS-07 매 사이클 전수 UPDATE | ✅ | 45841dd | animal-affiliation.test.ts |
| (기존 실패 16건) | ✅ | f159178 | 8건 DB 필요, 7건 옛 계약, 1건 mock — npm test 1360 통과 |

## P2
| ID | 상태 | 커밋 | 비고 |
|---|---|---|---|
| SEC-12 역학조사·KAHIS 권한 | ✅ | 50b4315 | quarantine-roles.guard.test.ts |
| SEC-13 경로 :farmId | ✅ | 6abdb1f | farm-param.guard.test.ts |
| SEC-14 Socket.IO | ✅ | 1f7a612 | socket-rooms.test.ts |
| SEC-15 SVG·CSP | ✅(부분) | 86cc8d9 | unsafe-eval 유지(Google Maps), 토큰 localStorage 는 별도 과제 |
| SEC-16 알림톡 남용 | ✅ | 6e77c7c | alimtalk.guard.test.ts |
| SEC-17 공개 가입 | ✅ | ba92e77 | onboarding.guard.test.ts |
| DI-10 이벤트 유니크 | ✅ | 2573b33 | 0042(중복 시 보류) |
| DI-11 KST 날짜 | ✅ | 4e7dbe6 | kst.test.ts |
| DI-12 수정·재고 트랜잭션 | ✅ | 87a1388 | insemination-tx.test.ts |
| DI-13 번식 설정 덮어쓰기 | ✅ | 5c438d1 | farm-settings-sync.test.ts |
| DI-14 출처 컬럼·유량 유니크 | ✅ | 5488d49 | 0043·0044 |
| DI-15 estrus-action | ✅ | 6112b51 | estrus-action.test.ts |
| AI-04 끊긴 대화 계속 실행 | ✅ | a0d0ed0 | chat-abort.test.ts |
| AI-05 추론 정지 스위치 | ✅ | 48bb026 | claude-client 테스트 |
| AI-06 결측→0 저장 | ✅ | b7871a3 | prediction-bridge-features.test.ts |
| AI-07 답변 수치 검증 | ✅ | 0a159fb | answer-verifier.test.ts |
| AI-08 모델·프롬프트·입력 출처 | ✅ | 11b5b84 | provenance.test.ts, briefing-log.test.ts · 0045(컬럼·테이블 추가만) |
| VO-04 끊긴 답변 표시 | ✅ | 0a159fb | stream-notes.test.ts |
| VO-05 재생 3경로 통합·세대 | ✅ | 45a3401 | voice-playback-generation.test.tsx (구 코드에서 2건 실패 재현) |
| VO-06 Chrome cancel 후 계속 말함 | ✅ | 45a3401 | 〃 |
| VO-07 중복 제출·늦은 Whisper | ✅ | 45a3401 | 〃 + inflight-dedupe.test.ts, chat-dedupe.test.ts (409) |
| VO-08 확인 요약 누락 필드·원문 전달 | ✅ | 050bc4d | write-confirmation.test.ts, stream-notes.test.ts |
| VO-09 음성 비용 남용 | ✅ | f6a9c0c | audio-limits.test.ts, tts-cache-bytes.test.ts |
| OPS-08 "false" 가 true | ✅ | 7a63de1 | env-bool.test.ts · ⚠️ KAKAO_ALIMTALK_TEST_MODE=false 환경은 배포 후 실발송 시작 |
| OPS-09 쿼리 타임아웃 | ✅ | 3a54c77 | pool-options.test.ts · 로컬 DB 실측(1s 초과 취소) |
| OPS-10 전 기간 스캔·DIM 5분 재계산 | ✅ | 3291465 | sensor-attached.test.ts, dim-throttle.test.ts |
| OPS-11 외부 호출 타임아웃 | ✅ | abbbf2a | anthropic-client-options.test.ts |
| OPS-12 메모리 상태(푸시·쿨다운·속도제한·Socket.IO) | ✅ | 8a226d6, 953444c, 3cedb23, 2fd4f3b | push-subscribe·cooldown-db·rate-limit-store·socket-redis-adapter 테스트 · 0046(테이블 추가만) · 실 Redis 2레플리카 전파 재현·해결 · 미배정 계정 전 농장 푸시 누수도 수정 |
| OPS-13 마이그레이션 실패·동시 실행 | ✅ | 7959971 | migration-status.test.ts · advisory lock 동시 실행 실측 · MIGRATIONS_STRICT 기본 꺼짐 |
| OPS-14 백필 대량 방송 | ✅ | aa5f80b | event-broadcast.test.ts · DI-10 후속(returning 행 짝짓기 오류)도 수정 |
| OPS-15 CI 보강 | ✅ | 1c038b0 | db-tests 잡(postgres:16)·lint 추가 · 필수 체크 지정은 저장소 설정 필요 |

## 승인·정책 대기 (코드로 해결 불가)
- 배포 시 실행될 마이그레이션: schema_migrations(자동), 0039 animals 유니크(중복 시 보류), 0040 job_leases·briefing_deliveries, 0041 인덱스, 0042 이벤트 유니크(중복 시 보류), 0043 source_event_id 컬럼, 0044 유량 유니크(중복 시 보류), 0045 AI 출처 컬럼·ai_briefing_log, 0046 push_subscriptions
  - 배포 직후 기존 브라우저 푸시 구독은 메모리에만 있었으므로 사용자가 다시 구독해야 한다 (OPS-12)
- 새 의존성: @socket.io/redis-adapter@8.3.0 (OPS-12) — Redis 연결 시에만 사용
- 새 환경변수(전부 기본값 있음): DB_STATEMENT_TIMEOUT_MS, ANTHROPIC_TIMEOUT_MS, ANTHROPIC_MAX_RETRIES, AUTO_MIGRATE, MIGRATIONS_STRICT, SOCKET_IO_REDIS_ADAPTER, TTS_HOURLY_LIMIT_PER_USER, STT_HOURLY_LIMIT_PER_USER
- OPS-08: 운영에 KAKAO_ALIMTALK_TEST_MODE=false 가 설정돼 있으면 배포 후 알림톡 실발송이 시작된다 (지금까지는 무시되어 로그만 남음) — 배포 전 확인
- OPS-15: GitHub 저장소 설정에서 build-and-test·db-tests 를 필수 체크로 지정
- 배포 시 `schema_migrations` 테이블 생성 (SEC-03)
- 기존 진료 기록 휴약 종료일 보정 (DI-01)
- 이동 개체 과거 기록 귀속 정책 (DI-02)
- DI-03: 운영 smaxtec_events.raw_data->>'event_ts' 샘플 확인 → 시간대 해석 결정
- DI-08: 운영 animals 중복(external_id·trace_id) 확인·정리 → 0039 인덱스 생성
- DI-09: 운영 sensor_measurements 중복 정리 → 유니크 인덱스
- AI-02: 옛 무차별 자동 레이블 데이터 정리 여부 (현재는 학습에서 제외만)
- SEC-22: 0033(비밀번호 해시)·0034(전화번호) 공개 저장소 노출 — 비밀번호 변경·저장소 비공개 여부

## 검증 기록 (P2 완료 시점, 로컬 — 2026-10-20)
- build 3종 통과 / lint 0 오류(경고 36, 기존과 동일)
- vitest server+shared 1108 통과·1 skip / web 266 통과
- CI db-tests 재현: 빈 DB에 마이그레이션 47/47 적용 → 루트 vitest 전체 166 파일·1458 통과·1 skip
- 잘못된 마이그레이션 파일을 넣으면 `npm run migrate` 종료 코드 1 확인

## 검증 기록 (P1 완료 시점, 로컬)
- typecheck 0 오류 / lint 0 오류(경고 36, 기존) / build 3종 통과
- vitest server+shared 1010 통과·1 skip / web 248 통과 / npm test 전체 1360 통과·1 skip (로컬 Postgres 가동)

## 테스트 기준선
- CI: build-and-test(빌드 3종·lint·server+shared·web) + db-tests(빈 DB 마이그레이션 + 루트 전체) 통과 유지가 조건
- 기준 커밋의 루트 테스트 16건 실패는 f159178 에서 해결

## 다음 작업
- P3 13건 → Phase 5 통합 검증(권한·농장 격리·smaXtec 수집·AI 기록 저장·음성 회귀, SEC-15 CSP 브라우저 확인) → Phase 6 품질 감독 체계

## 이후 단계 (오류 수정·검증 완료 후 착수 — 2026-10-20 차세대 개발 지시서)
- 2장 대화형 AI 중심 UI 간소화, 3장 역할별 워크스페이스(목장주·수의사 다목장·행정·방역),
  4장 범용 대화 AI 품질 원인 분석, 5장 데이터 출처 추적(실측/계산/추정/시뮬레이션 구분),
  6장 대화형 업무 실행, 7장 음성 고도화, 8장 KPI 정의서
- 원칙: 기존 기능 보존 우선, 오류 77건 정리 이후 진행
