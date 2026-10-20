# CowTalk 품질 게이트 (Phase 6)

> 국가가 쓰는 플랫폼 — 오류를 "고치는" 것보다 "다시 생기지 않게" 하는 것이 목적이다.
> 2026-10-20 기술 감사(77건) 후속 작업에서 만든 장치들이다.

## 1. 푸시 전: `npm run verify`
CI 와 **같은 단계를 같은 순서로** 로컬에서 실행한다. 통과하지 못하면 푸시하지 않는다.

| 단계 | 내용 | 실패 시 |
|---|---|---|
| 1~3 | shared / server / web 빌드 (tsc 포함) | 타입 오류 |
| 4 | lint (오류 0, 경고는 보고만) | 규칙 위반 |
| 5 | 알람 신뢰도 0-1 단위 감사 (`audit:confidence-units`) | 0-100 값 재등장 |
| 6 | server+shared 단위 테스트, web 테스트 | 회귀 |
| 7 | **빈 로컬 DB 생성 → 마이그레이션 전체 → 루트 테스트 전체** | 마이그레이션·DB 통합 회귀 |

- 7단계는 `DB_HOST` 가 localhost/127.0.0.1 일 때만 실행한다(운영 DB 보호). 실행하지 못하면
  마지막에 `⚠️ 미실행` 을 출력하고 종료 코드 2 — **미실행을 통과로 보고하지 않는다.**
- 교훈: NEW-04 를 루트 테스트 없이 푸시해 CI 가 빨개질 뻔했다 → 이 스크립트를 만든 이유.

## 2. CI (`.github/workflows/ci.yml`)
- `build-and-test`: 빌드 3종 · lint · 단위 감사 · 단위 테스트 · web 테스트
- `db-tests`: postgres:16 서비스 · 빈 DB 에 `npm run migrate`(실패 시 종료 코드 1) · 루트 vitest 전체
- **저장소 설정에서 두 잡을 필수 체크(branch protection)로 지정해야 한다** — 워크플로 파일로는 못 한다.

## 3. 상시 회귀 장치 (CI db-tests 에서 매번 실행)
| 테스트 | 지키는 것 |
|---|---|
| `tests/server/farm-isolation-sweep.test.ts` | 모든 GET 라우트를 라우트 표에서 자동 수집 → 다른 농장 ID 로 호출해도 그 농장 표지가 안 보인다. 전국 행정관 대조군이 표지를 봐야 통과(눈 감은 점검 방지). 새 라우트도 자동 포함 |
| `tests/server/farm-isolation-write-probe.test.ts` | 모든 쓰기 라우트 → 다른 농장 데이터가 바뀌지 않고, 허용 목록 밖 2xx 없음 |
| `tests/server/ai-record-confirmation-e2e.test.ts` | AI 기록: 제안만 → "저장하지 마" 미저장 → 같은 턴 자기 확인 미저장 → 다음 턴 "저장해" 1건 → 재사용 무시 |
| `tests/server/smaxtec-sync-e2e.test.ts` | 수집: 중복 1건 · 재실행 멱등 · 24h 만 방송(올바른 개체) · 목장 이동 이력 |
| `tests/server/raw-sql-date-params.test.ts` | 원시 SQL 에 Date 객체를 넘겨 조용히 실패하던 유형 |

## 4. 코드 규칙 (이번 수정에서 반복된 결함 유형)
1. **목장 범위**: 목록 조회는 `farmScopeForRequest` + `farmScopeWhere`/`farmScopeSqlFragment`, 경로 `:farmId` 는 `farmParamGuard`, 개체는 `requireAnimalAccess`. 새 라우트는 격리 점검이 자동으로 검사한다.
2. **관리 권한과 데이터 범위를 섞지 않는다**: 관리 권한은 `isMaster`(requirePlatformAdmin), 데이터 범위는 `hasAllFarmScope` (SEC-21).
3. **원시 SQL 날짜**: `${date}` 금지 → `${date.toISOString()}::timestamptz` (NEW-01).
4. **"오늘"은 KST**: `lib/kst.ts` (DI-11·16).
5. **지어낸 값 금지**: 합성 센서·고정 신뢰도·가짜 변환 결과 대신 `null`/`noData`/501 (AI-03·AI-06·NEW-04).
6. **기록 도구는 확인 게이트를 거친다**: 우회 경로 없음 (VO-01·02·08·NEW-05).
7. **외부 호출은 타임아웃**: `AbortSignal.timeout`, Anthropic SDK 옵션 (OPS-11).
8. **테스트 기대값을 바꿀 때**는 왜 예전 기대값이 결함을 굳혀 두었는지 주석으로 남긴다 — 삭제·skip 금지.
