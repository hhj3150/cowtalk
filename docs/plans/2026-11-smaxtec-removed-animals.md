# smaXtec에서 빠진 개체 처리 — 학회(11/2) 이후 작업 계획서

작성 2026-10-29 · 상태: **계획만 (배포·데이터 변경 금지, 하원장님 승인 후 실행)**

## 1. 확정된 원인

| 사실 | 근거 |
|---|---|
| smaXtec은 도태·판매된 개체를 계정의 개체 목록에서 뺀다 | 송영신목장 미갱신 10두가 모두 도태 개체임을 현장 확인 (하원장님, 10-29) |
| CowTalk 동기화는 응답에 **있는** 개체만 갱신하고, 빠진 개체는 손대지 않아 `active`로 남는다 | `pipeline/sync.service.ts` `syncAnimals` |
| 센서 수집은 DB의 `active` 개체를 목장 구분 없이 고른다 → 빠진 개체에 요청 → **403 access denied** | `pipeline/orchestrator.ts` `collectSensorBatch` |
| `updated_at`은 "마지막 동기화 시각"이 아니다 — `updateDimAndParity()`가 5분마다 분만 기록 있는 모든 active 개체의 `updated_at`을 DIM이 바뀔 때 갱신 | `sync.service.ts` `updateDimAndParity`, `normalizeLactationStatus` |
| 403은 재시도해도 같은데 3회 재시도(1s+2s 대기) + 로그 4줄/개체 | `smaxtec.connector.ts` `fetchSensorData` → `withRetry` |

운영 실측 (10-29 11:32 KST, 읽기 전용): active 11,802두 중 최신 동기화(7,311두)에서 빠진 개체 **약 4,773두(40%)**, 171개 목장.
목장 통째로 빠진 형태 5곳/43두, 일부 개체만 빠진 형태가 대부분.

## 2. 작업 항목 (PR 1개, 순서대로 커밋)

### 2-1. 스키마 (마이그레이션 0039)

```sql
ALTER TABLE animals
  ADD COLUMN last_seen_in_sync_at timestamptz,          -- smaXtec 응답에 마지막으로 포함된 시각 (동기화만 갱신)
  ADD COLUMN sync_missing_count integer NOT NULL DEFAULT 0, -- 연속 미응답 횟수
  ADD COLUMN inactive_reason varchar(40);                 -- smaxtec_removed | smaxtec_org_removed | manual | ...
CREATE INDEX animals_last_seen_idx ON animals (last_seen_in_sync_at);
```

- 기존 `animal_status_history`에 상태 변경 이력을 남긴다 (`reason`에 사유·근거).
- 개체 행·이벤트·센서 기록은 **삭제하지 않는다** (번식·도태 통계에 필요).

### 2-2. 동기화: 응답에 없는 개체의 유예 처리

`syncAnimals` 끝에서 **이번 사이클에 개체 목록 조회가 성공한 org만** 대상으로 처리한다.
(조회 실패 org는 `Promise.allSettled`에서 rejected → 그 org의 개체는 이번 사이클에 판정하지 않는다. 일시적 API 오류로 멀쩡한 개체가 비활성되는 것을 막는 핵심 안전장치)

| 상황 | 처리 |
|---|---|
| 응답에 있음 | `last_seen_in_sync_at = now()`, `sync_missing_count = 0`. 이전에 `inactive_reason='smaxtec_removed'`였다면 **다시 active** (이력 기록) |
| 응답에 없음 (org 조회는 성공) | `sync_missing_count += 1` |
| `sync_missing_count >= 3` **그리고** `last_seen_in_sync_at < now() - 6h` (또는 NULL) | `status='inactive'`, `inactive_reason='smaxtec_removed'`, 이력 기록 |
| org가 계정 org 목록에서 통째로 빠짐 | 개체 판정 안 함. 목장 단위 경고 로그 1회 + 관리자 확인 대상 (`inactive_reason='smaxtec_org_removed'`는 사람이 결정) |

- 횟수(3회)와 시간(6h)을 **둘 다** 요구 → 5분 주기 3회(15분)만으로 비활성되지 않게.
- 값은 환경변수로 조정 가능하게: `SMAXTEC_MISSING_CYCLES=3`, `SMAXTEC_MISSING_MIN_HOURS=6`.
- 한 사이클에 비활성 처리 대상이 org 개체의 50%를 넘으면 그 org는 처리 보류 + 경고 (대량 오판 방지 서킷브레이커).

### 2-3. `updated_at` 오염 제거
- `updateDimAndParity`, `normalizeLactationStatus`의 `updated_at = now()` 제거 (값 갱신만).
- "동기화 신선도"는 이후 `last_seen_in_sync_at`만 본다 (`/health/deep`, 보고서 포함).

### 2-4. 센서 수집 대상 제한 (`collectSensorBatch`)
```ts
.where(and(
  isNotNull(animals.externalId),
  eq(animals.status, 'active'),
  gt(animals.lastSeenInSyncAt, sql`now() - interval '1 hour'`), // 직전 동기화에 포함된 개체만
  or(isNull(animals.sensorDeniedUntil), lt(animals.sensorDeniedUntil, sql`now()`)),
))
.orderBy(animals.animalId)   // 정렬 추가 — 지금은 정렬 없이 offset 순환이라 건너뜀·중복 가능
```

### 2-5. 403·404는 재시도하지 않음
- `SmaxtecApiClient.request`가 HTTP 상태를 담은 오류(`SmaxtecHttpError { status }`)를 던지게 한다.
- `withRetry`에 `shouldRetry(err)` 옵션 추가: 네트워크·타임아웃·429·5xx만 재시도. 400/403/404/422는 즉시 실패.
- 센서 403: 개체당 **1회 info 로그** + `sensor_denied_until = now() + 24h`
  (컬럼을 2-1에 함께 추가: `sensor_denied_until timestamptz`). 메모리 맵이 아니라 DB에 두어 재시작에도 유지.
- 사이클 끝에 요약 1줄: `[Pipeline] Sensor batch — ok n, denied n, failed n`.

### 2-6. 집계 수치
- `/api/public/stats`의 `totalCattle`·`totalSensors`는 2-2 적용 후 자동으로 실제 사육 두수에 수렴.
- 발표·제안서 수치는 적용 전까지 smaXtec 동기화 기준(약 7,300두)을 쓴다.

### 2-7. 테스트
- 단위: 미응답 카운트 증가/리셋, 3회+6h 조건, org 조회 실패 시 판정 제외, 50% 서킷브레이커, 재등장 시 재활성, 403 비재시도·24h 건너뜀, DIM 갱신이 `updated_at`을 바꾸지 않음.
- DB 통합: 가짜 smaXtec 응답 3사이클 → 빠진 개체만 inactive + 이력 1건.
- CI 5단계 로컬 재현 후 PR.

## 3. 기존 미갱신 active 개체(약 4,773두) 정리

**권장: SQL 일괄 처리보다 2-2 로직에 맡긴다.** 배포 후 정상 동기화 몇 사이클이 돌면 같은 규칙(3회+6h)으로 자동 정리되고 이력도 남는다.
일괄 SQL은 로직 배포 전에 서둘러야 할 이유가 있을 때만 쓴다. 어느 쪽이든 **사전 백업은 필수**.

### 3-1. 사전 백업 (실행 전 반드시)
1. Railway Postgres → Backups에서 수동 백업 생성 (또는 `pg_dump -t animals -t animal_status_history` 를 로컬에 저장).
2. DB 안에 스냅샷 테이블도 남긴다 (되돌리기용):
```sql
CREATE TABLE animals_backup_20261103 AS
SELECT animal_id, status, inactive_reason, updated_at, deleted_at FROM animals;
```

### 3-2. 대상 확인 (dry-run, 읽기 전용)
마이그레이션 0039 배포 → 정상 동기화가 **최소 24시간** 돈 뒤 (그동안 응답에 있는 개체는 `last_seen_in_sync_at`이 채워짐):
```sql
-- 대상 수와 목장별 분포
SELECT f.name, count(*) AS to_deactivate
FROM animals a JOIN farms f ON f.farm_id = a.farm_id
WHERE a.status = 'active' AND a.deleted_at IS NULL AND a.external_id IS NOT NULL
  AND a.last_seen_in_sync_at IS NULL            -- 배포 후 24시간 동안 한 번도 응답에 없음
  AND f.external_id IN (/* 현재 계정 org 목록 — 통째로 빠진 org는 제외하고 따로 판단 */)
GROUP BY f.name ORDER BY 2 DESC;
```
→ 결과를 하원장님께 보고하고 승인받는다. (송영신목장 10두 = 도태 확인 완료 → 검증 기준으로 사용)

### 3-3. 일괄 처리 (승인 후, 트랜잭션 1개)
```sql
BEGIN;
WITH targets AS (
  SELECT a.animal_id FROM animals a JOIN farms f ON f.farm_id = a.farm_id
  WHERE a.status = 'active' AND a.deleted_at IS NULL AND a.external_id IS NOT NULL
    AND a.last_seen_in_sync_at IS NULL
    AND f.external_id IN (/* 3-2와 동일 */)
), hist AS (
  INSERT INTO animal_status_history (animal_id, previous_status, new_status, reason)
  SELECT animal_id, 'active', 'inactive', 'smaxtec_removed: bulk cleanup 2026-11 (not in sync for 24h+)'
  FROM targets
  RETURNING animal_id
)
UPDATE animals SET status = 'inactive', inactive_reason = 'smaxtec_removed'
WHERE animal_id IN (SELECT animal_id FROM targets);
-- 건수 확인 후 3-2 결과와 같으면 COMMIT, 다르면 ROLLBACK
COMMIT;
```

### 3-4. 되돌리기
```sql
BEGIN;
WITH restored AS (
  UPDATE animals a SET status = b.status, inactive_reason = b.inactive_reason
  FROM animals_backup_20261103 b
  WHERE a.animal_id = b.animal_id
    AND a.inactive_reason = 'smaxtec_removed'
    AND b.status = 'active'                 -- 일괄 처리로 바뀐 개체만 되돌린다
  RETURNING a.animal_id
)
INSERT INTO animal_status_history (animal_id, previous_status, new_status, reason)
SELECT animal_id, 'inactive', 'active', 'rollback of 2026-11 bulk cleanup' FROM restored;
COMMIT;
```
- 스냅샷 테이블(3-1의 2번)은 `inactive_reason` 컬럼이 생긴 **마이그레이션 0039 이후**에 만든다.
- 2-2 로직은 응답에 다시 나타난 개체를 자동으로 재활성하므로, 잘못 비활성된 개체도 다음 동기화에서 복구된다.

## 4. 순서와 일정 (제안)

| 단계 | 내용 | 운영 영향 |
|---|---|---|
| 1 | 2-1 ~ 2-7 PR, CI 통과, 리뷰 | 없음 |
| 2 | 배포 (평일 오전, 학회 이후) | 403 즉시 감소, 로그 감소 |
| 3 | 24시간 관찰: 403 건수, 비활성 처리 건수, 송영신 10두 처리 여부 | — |
| 4 | 3-2 dry-run 보고 → 승인 → 3-3 (자동 정리로 충분하면 생략) | 두수 통계가 실제 사육 두수로 바뀜 |

## 5. 관련 별도 이슈
- smaXtec 이벤트 `detected_at`이 약 9시간 미래로 저장됨 (KST↔UTC) — 별도 작업. `updateDimAndParity`의 DIM 계산도 이 값을 쓰므로 함께 확인.
- 기동 직후 로그 폭증 (Railway 500 logs/sec 초과) — `LOG_LEVEL=info` 확인됨. 2-5의 403 로그 축소와 동기화 개체별 오류 로그 묶기로 함께 완화.
