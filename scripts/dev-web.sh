#!/bin/bash
# iCloud 환경에서 Vite 실행을 위한 래퍼 스크립트
# Desktop이 iCloud 동기화 되어 있어 fsevents가 hang되므로
# /tmp에 소스를 동기화하고 거기서 실행

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="/tmp/cowtalk-v5"
PORT="${PORT:-5173}"

# /tmp에 프로젝트 동기화 (node_modules 제외)
rsync -a --delete \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  "$PROJECT_ROOT/" "$DEST/" 2>/dev/null

# node_modules가 없으면 설치
if [ ! -d "$DEST/node_modules" ]; then
  echo "Installing dependencies..."
  cd "$DEST" && npm install --cache /tmp/npm-cache 2>/dev/null
fi

cd "$DEST/packages/web"
exec node ./node_modules/vite/bin/vite.js --port "$PORT" --host
