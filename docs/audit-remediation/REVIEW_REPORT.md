# CowTalk AX 기술 감사(기준 694db91) 수정 결과 — 독립 검토용 보고서

- 브랜치: `claude/exciting-gates-6zvts7` · PR: hhj3150/cowtalk#169 (Draft, 미병합)
- 작성: 2026-10-20 · **운영 배포·운영 DB 변경·실데이터 보정은 하지 않았음** (별도 승인 대상)
- 상세 진행표: `docs/audit-remediation/PROGRESS.md` · 품질 게이트: `docs/quality-gates.md`

## 1. 요약
| 구분 | 감사 건수 | 수정 완료 | 부분·보류 |
|---|---|---|---|
| P0 | 5 | 5 | – |
| P1 | 28 | 26 | DI-03 일부(운영 원본 샘플 필요), OPS-03 보류(smaXtec API 파라미터 미확인) |
| P2 | 31 | 31 | SEC-15 일부(토큰 localStorage·Google Maps unsafe-eval) |
| P3 | 13 | 13 | – |
| 감사 외 신규 발견 | – | NEW-01~05 + 3건 | – |

## 2. 검증 방법 (재현 명령)
- 로컬 게이트: `npm run verify` (CI 와 같은 7단계, DB 단계는 빈 로컬 DB 에서)
- CI: `build-and-test`, `db-tests` (postgres:16) — GitHub Actions
- 판정 원칙: 회귀 테스트는 가능한 한 **수정 전 코드에서 실패함을 확인**했다 (커밋 메시지에 표기)

## 3. 최종 검증 결과 (로컬, 2026-10-20)
| 단계 | 결과 |
|---|---|
| 빌드 shared/server/web | 통과 |
| lint | 오류 0 (경고 36 — 기준 커밋과 동일) |
| 신뢰도 단위 감사 | 통과 |
| server+shared 단위 | 143 파일 · 1144 통과 · 1 skip(기존 REDIS_TEST 조건부) |
| web | 29 파일 · 267 통과 |
| db-tests (빈 DB → 마이그레이션 48개 → 루트 전체) | 183 파일 · 1513 통과 · 1 skip |
| 미실행 | 실제 smaXtec 계정 수집(자격증명 사용 금지), 브라우저 실제 음성 재생·마이크, Google Maps CSP(외부망 없음) |

## 4. 커밋 대장 (오류 ID → 커밋)
| ID | 커밋 | 내용 |
|---|---|---|
| SEC-01 | `d7b42f1` | prevent SQL injection and cross-farm access in farm comparison |
| SEC-02 | `2e62209` | lock down unauthenticated smaXtec debug API |
| SEC-03 | `d577415` | remove name-based owner check and stop re-running applied migrations |
| DI-01 | `b8cd89b` | correct withdrawal end calculation (KST, hour-based, per-drug milk/meat) |
| DI-02 | `1b57e54` | update current farm of moved animals and keep history |
| VO-01,VO-02 | `a5d2e94` | judge write confirmation on the user's own words only |
| VO-03 | `7ca9b17` | stop converting everyday words into animal numbers |
| SEC-04 | `5a29163` | require auth and scope on epidemic early-warning API |
| SEC-05,SEC-06,SEC-07 | `2717d69` | restrict admin/user APIs and master tokens |
| SEC-08 | `4a71a70` | enforce farm scope on breeding read/write APIs |
| SEC-09 | `4d80d51` | scope-check body farmId/animalId on record write APIs |
| SEC-10,SEC-11 | `035302a` | scope AI farm-name search and close UUID-format bypass |
| AI-01 | `f608913` | stop chat regex from writing clinical/breeding records without confirmation |
| AI-02 | `d2c69ce` | label only fired alarms and keep blind auto-labels out of learning |
| AI-03 | `cb855d7` | stop presenting synthetic sensor values as measurements |
| DI-03 | `3555a5e` | flag missing/invalid/future smaXtec timestamps instead of inventing them (partial) |
| DI-04 | `3192a42` | per-org collection cursors on create_ts, advanced only after DB sync |
| DI-05 | `79f7308` | keep manual values and terminal status when syncing animals |
| DI-06 | `cad0cf7` | count calving episodes once and never lower parity |
| DI-07 | `c3c98a9` | write health_event and treatment in one transaction |
| DI-08 | `f02af81` | match animals by trace ID and add guarded unique indexes |
| DI-09 | `9a332e3` | skip already-stored sensor samples before insert |
| OPS-01 | `0e2c43b` | sweep sovereign alarms across all active farms |
| OPS-02 | `4514f57` | bound /health/deep Redis ping and coalesce requests |
| OPS-04 | `929d2c3` | DB job leases and briefing ledger to stop duplicate runs/sends |
| OPS-05 | `6ec2c24` | keyset sensor batches, per-animal backfill window, no overlap |
| OPS-06 | `129cca4` | index sync hot-path lookups |
| OPS-07 | `45841dd` | update only changed animal fields and batch head counts |
| tests | `f159178` | resolve the 16 pre-existing root test failures; map 22P02 to 400 |
| SEC-12 | `50b4315` | restrict investigation/KAHIS/quarantine work APIs by role |
| SEC-13 | `6abdb1f` | scope-check :farmId path params across unguarded routers |
| SEC-14 | `1f7a612` | approval gate, scope-based rooms and expiry for Socket.IO |
| SEC-15 | `86cc8d9` | allowlist SVG sanitizer for AI artifacts; drop script unsafe-inline |
| SEC-16 | `6e77c7c` | stop arbitrary paid Alimtalk sends |
| SEC-17 | `ba92e77` | validate and rate-limit public onboarding; pending farms until approval |
| DI-10 | `2573b33` | unique external_event_id with conflict-skip on insert |
| DI-11 | `4e7dbe6` | use KST dates for 'today' and daily sensor aggregation |
| DI-12 | `87a1388` | transactional, idempotent insemination record with semen deduction |
| DI-13 | `5c438d1` | keep farm breeding settings when smaXtec returns nothing mappable |
| DI-14 | `5488d49` | source_event_id for synced breeding records; guarded milk day unique |
| DI-15 | `6112b51` | record estrus actions through the standard breeding path |
| AI-04 | `a0d0ed0` | abort Claude/tool loop when the chat client disconnects |
| AI-05 | `48bb026` | honor ANTHROPIC_THINKING_BUDGET=0 kill switch on deep analysis |
| AI-06 | `b7871a3` | store missing diagnosis evidence as null and persist data quality |
| AI-07,VO-04 | `0a159fb` | verify answer ear tags/temps against evidence; mark cut-off streams |
| AI-08 | `11b5b84` | record model, prompt hash, input hash and briefing outputs for audit |
| OPS-08 | `7a63de1` | parse boolean env vars so "false" actually disables |
| OPS-09 | `3a54c77` | add statement_timeout to the shared DB pool |
| OPS-10 | `3291465` | stop full-history scans on dashboard load and 5-minute DIM recompute |
| OPS-11 | `abbbf2a` | bound external calls with timeouts |
| OPS-14 | `aa5f80b` | broadcast only last-24h events and bound snapshot captures during backfill |
| OPS-13 | `7959971` | serialize migrations across replicas and surface failures |
| OPS-12 | `8a226d6` | persist web push subscriptions and target by current farm access |
| OPS-12 | `953444c` | derive alert cooldown from the alerts table, not memory only |
| OPS-12 | `3cedb23` | share rate-limit counters through Redis with memory fallback |
| OPS-12 | `2fd4f3b` | Socket.IO Redis adapter for cross-replica alarm delivery |
| OPS-15 | `1c038b0` | run DB-backed tests, migrations and lint in CI |
| VO-09 | `f6a9c0c` | cap TTS/STT cost per account and fix model/length on the server |
| VO-08 | `050bc4d` | show every saved field in the confirmation summary and send it to the UI verbatim |
| VO-05,VO-06,VO-07 | `45a3401` | one stop for all voice paths, cancel-safe browser speech, one submission per utterance |
| SEC-18 | `13830ed` | refuse to boot in production with public JWT secrets; pin HS256 |
| SEC-19 | `ed30e7b` | pin CORS to exact CowTalk origins for API and Socket.IO |
| SEC-20 | `bf747fb` | bind generated report downloads to their creator |
| SEC-21 | `40b30f3` | OPEN_DATA_SCOPE opens data scope only, not admin privileges |
| DI-16 | `c690e29` | KST month key for long-open reminders; honest name for the 24h window |
| DI-17 | `4938fdd` | record source event / sensor window on predictions and diagnosis history |
| NEW-01 | `63a6da0` | pass dates to raw SQL as ISO strings — conception stats, semen ranking, repeat-breeder check were silently empty |
| AI-09 | `a1fb470` | label hand-set fusion scores as heuristic; run confidence-unit audit in CI |
| AI-10 | `dc61c81` | fall back to the rule-based answer on runtime Claude errors |
| VO-10 | `88f2f20` | remember a failed audio-model probe for 60s instead of re-probing every request |
| VO-11 | `92ded60` | read "AI" as 인공 수정 only in breeding context |
| VO-12 | `0e458dc` | cancel in-flight TTS requests when streaming speech stops |
| OPS-16 | `d04b932` | revalidate socket approval, deliver estrus alerts to all-farm viewers, bound caches |
| OPS-17 | `7c11588` | remove dead profile-cache code; keep the live Redis client in lib/redis.ts |
| NEW-02 | `66f7466` | close cross-farm data leaks found by a full GET-route isolation sweep |
| NEW-03 | `f57b056` | sensor history 500 on the default 24h range; handler validation errors → 400 |
| NEW-04 | `39594d5` | admin-only for global AI recalibration jobs; stop returning a fabricated voice parse |
| SEC-15 | `2e0e087` | browser-verified CSP; allow only the Pretendard font path |
| NEW-05 | `7ef3e63` | same-turn confirmation no longer reads the request as the user's answer |
| phase5 | `612996e` | smaXtec sync end-to-end on a real DB with a fake smaXtec payload |
| NEW-04 | `c18dfae` | expect 501 from the former fake /events/voice stub |
| phase6 | `da14871` | local quality gate mirroring CI, gate documentation, PR checklist |

## 5. 남은 위험·결정 필요 사항
1. **배포 전 확인 (기동 실패·동작 변화 가능)**
   - 운영 `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` 이 기본값·예시값이면 서버가 기동하지 않음 (SEC-18, 의도된 차단)
   - 운영 프런트 도메인이 cowtalk.netlify.app·cowtalk.kr 계열이 아니면 `CORS_EXTRA_ORIGINS` 필요 (SEC-19)
   - `KAKAO_ALIMTALK_TEST_MODE=false` 설정 시 배포 후 알림톡 실발송 시작 (OPS-08)
   - `OPEN_DATA_SCOPE` 운영 값 확인 — 켜져 있어도 이제 관리자 권한은 주지 않음 (SEC-21)
   - 기존 브라우저 푸시 구독은 재구독 필요 (OPS-12)
2. **마이그레이션 0039~0047** — 0039·0042·0044 는 운영 중복 데이터가 있으면 인덱스를 만들지 않고 경고(서비스는 유지, /health/deep 에 표시)
3. **승인 대기**: 휴약 종료일 보정(DI-01), 이동 개체 과거 기록 귀속(DI-02), 옛 자동 레이블 정리(AI-02), 운영 중복 데이터 정리, DI-03 운영 샘플, OPS-03 smaXtec 파라미터, SEC-22(0033·0034 계정 정보 공개 저장소 노출 — 비밀번호 변경·저장소 비공개)
4. **자체 실수 기록**: NEW-04 를 루트 테스트 없이 푸시해 그 커밋의 CI db-tests 가 실패할 수 있었음 → 다음 커밋(c18dfae)에서 기대값 수정, 재발 방지로 `npm run verify` 도입

## 6. 배포 가능 여부
코드·테스트 관점에서는 배포 준비가 되었으나, **운영 배포는 하원장님 승인 전 하지 않는다.** 배포 시 5장 1·2 항목을 먼저 확인해야 한다.
