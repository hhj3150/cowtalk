#!/usr/bin/env bash
# CowTalk 로컬 품질 게이트 — CI(.github/workflows/ci.yml)와 같은 단계를 같은 순서로 실행한다.
# 푸시 전에 반드시 실행: npm run verify
#   - DB 단계(db-tests 재현)는 VERIFY_DB_NAME 의 빈 DB 를 새로 만들어 마이그레이션 전체를 적용한 뒤 루트 테스트 전체를 돈다.
#     로컬 Postgres 가 없거나 VERIFY_SKIP_DB=1 이면 건너뛰고, 건너뛴 사실을 마지막에 '미실행'으로 표시한다.
#   - 운영 DB 에는 절대 연결하지 않는다: DB_HOST 가 localhost/127.0.0.1 이 아니면 DB 단계를 거부한다.
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n▶ %s\n' "$1"; }
SKIPPED=()

step "1/7 build shared";  npm run build --workspace @cowtalk/shared >/dev/null
step "2/7 build server";  npm run build --workspace @cowtalk/server >/dev/null
step "3/7 build web";     npm run build --workspace @cowtalk/web >/dev/null
step "4/7 lint";          npm run lint >/dev/null
step "5/7 confidence unit audit"; npm run audit:confidence-units
step "6/7 unit tests (server + shared) + web tests"
npx vitest run packages/server/src packages/shared/src
npm run test --workspace @cowtalk/web

step "7/7 db-tests (빈 DB → 마이그레이션 전체 → 루트 테스트 전체)"
DB_HOST_EFF="${DB_HOST:-localhost}"
VERIFY_DB="${VERIFY_DB_NAME:-cowtalk_verify}"
if [[ "${VERIFY_SKIP_DB:-0}" == "1" ]]; then
  SKIPPED+=("db-tests (VERIFY_SKIP_DB=1)")
elif [[ "$DB_HOST_EFF" != "localhost" && "$DB_HOST_EFF" != "127.0.0.1" ]]; then
  echo "DB_HOST=$DB_HOST_EFF — 로컬이 아닌 DB 에는 검증 DB 를 만들지 않는다"; SKIPPED+=("db-tests (원격 DB_HOST 거부)")
elif ! command -v psql >/dev/null || ! PGPASSWORD="${DB_PASSWORD:-cowtalk_dev_2025}" psql -h "$DB_HOST_EFF" -U "${DB_USER:-cowtalk}" -d postgres -c 'select 1' >/dev/null 2>&1; then
  SKIPPED+=("db-tests (로컬 Postgres 연결 불가)")
else
  export PGPASSWORD="${DB_PASSWORD:-cowtalk_dev_2025}"
  psql -h "$DB_HOST_EFF" -U "${DB_USER:-cowtalk}" -d postgres -q -c "DROP DATABASE IF EXISTS ${VERIFY_DB}" -c "CREATE DATABASE ${VERIFY_DB}"
  NODE_ENV=test DB_HOST="$DB_HOST_EFF" DB_NAME="$VERIFY_DB" REDIS_ENABLED=false npm run migrate --workspace @cowtalk/server
  NODE_ENV=test DB_HOST="$DB_HOST_EFF" DB_NAME="$VERIFY_DB" REDIS_ENABLED=false npx vitest run
  psql -h "$DB_HOST_EFF" -U "${DB_USER:-cowtalk}" -d postgres -q -c "DROP DATABASE IF EXISTS ${VERIFY_DB}"
fi

printf '\n✅ 품질 게이트 통과\n'
if (( ${#SKIPPED[@]} > 0 )); then
  printf '⚠️ 미실행: %s\n' "${SKIPPED[@]}"
  exit 2
fi
