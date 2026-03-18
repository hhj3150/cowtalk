#!/usr/bin/env bash
# CowTalk v5 — 배포 스크립트
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"

echo "=== CowTalk v5 배포 ==="

# .env 확인
if [ ! -f .env ]; then
  echo "ERROR: .env 파일이 없습니다. .env.example을 복사하세요."
  exit 1
fi

# 빌드
echo ">>> Docker 이미지 빌드 중..."
docker compose -f "$COMPOSE_FILE" build

# 기존 컨테이너 정지 + 새 컨테이너 시작
echo ">>> 서비스 시작 중..."
docker compose -f "$COMPOSE_FILE" up -d

# 상태 확인
echo ">>> 서비스 상태:"
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "=== 배포 완료 ==="
echo "  Web:    http://localhost:80"
echo "  API:    http://localhost:4000"
echo "  Health: http://localhost:4000/api/health"
