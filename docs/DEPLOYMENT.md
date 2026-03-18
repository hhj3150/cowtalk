# CowTalk v5.0 Deployment Guide

## Architecture

```
[Nginx (Web)] :80 --> [Express (API)] :4000 --> [PostgreSQL 16 + TimescaleDB] :5432
                                             --> [Redis 7] :6379
```

---

## 1. Docker Compose Setup

### Development (DB only)

개발 환경에서는 PostgreSQL + Redis만 Docker로 실행하고, 서버/웹은 로컬에서 실행합니다.

```bash
# DB + Redis 시작
docker compose up -d

# 상태 확인
docker compose ps
```

**`docker-compose.yml`** 구성:
- `cowtalk-postgres` - TimescaleDB (PostgreSQL 16), port 5432
- `cowtalk-redis` - Redis 7 Alpine, port 6379

### Production (Full Stack)

```bash
# 프로덕션 배포 (배포 스크립트 사용)
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

또는 수동:

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

**`docker-compose.prod.yml`** 구성:
- `cowtalk-postgres-prod` - TimescaleDB, .env 기반 credentials
- `cowtalk-redis-prod` - Redis 7 + password, port 6379
- `cowtalk-server-prod` - Express API, port 4000
- `cowtalk-web-prod` - Nginx + React SPA, port 80

---

## 2. Environment Variables

`.env.example`을 `.env`로 복사 후 실제 값을 설정합니다.

```bash
cp .env.example .env
```

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | 환경 | `development` / `production` |
| `PORT` | API 서버 포트 | `4000` |
| `DB_HOST` | PostgreSQL 호스트 | `localhost` |
| `DB_PORT` | PostgreSQL 포트 | `5432` |
| `DB_NAME` | 데이터베이스 이름 | `cowtalk` |
| `DB_USER` | DB 사용자 | `cowtalk` |
| `DB_PASSWORD` | DB 비밀번호 | (프로덕션에서 강한 비밀번호 사용) |
| `REDIS_HOST` | Redis 호스트 | `localhost` |
| `REDIS_PORT` | Redis 포트 | `6379` |
| `REDIS_PASSWORD` | Redis 비밀번호 | (프로덕션에서 설정) |
| `JWT_ACCESS_SECRET` | JWT Access 시크릿 (32자 이상) | (랜덤 생성) |
| `JWT_REFRESH_SECRET` | JWT Refresh 시크릿 (32자 이상) | (랜덤 생성) |
| `JWT_ACCESS_EXPIRES_IN` | Access 토큰 만료 | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh 토큰 만료 | `7d` |

### External API Variables

| Variable | Description |
|----------|-------------|
| `SENSOR_API_URL` | 위내센서 API URL |
| `SENSOR_API_EMAIL` | 센서 계정 이메일 |
| `SENSOR_API_PASSWORD` | 센서 계정 비밀번호 |
| `SENSOR_ORG_ID` | 센서 조직 ID |
| `ANTHROPIC_API_KEY` | Anthropic Claude API 키 (Chat 기능) |
| `PUBLIC_DATA_API_KEY` | 공공데이터포털 API 키 |
| `WEATHER_API_KEY` | 날씨 API 키 |

### Notification Variables

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP 서버 호스트 |
| `SMTP_PORT` | SMTP 포트 (default 587) |
| `SMTP_USER` | SMTP 사용자 |
| `SMTP_PASSWORD` | SMTP 비밀번호 |
| `SMS_API_KEY` | SMS API 키 |
| `SMS_SENDER` | SMS 발신 번호 |

### Frontend Variables

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | API 서버 URL (프론트 빌드 시 주입) |
| `VITE_SOCKET_URL` | WebSocket URL |

---

## 3. Database Setup

### PostgreSQL 16 + TimescaleDB

Docker Compose로 자동 생성됩니다. 수동 설정이 필요한 경우:

```bash
# TimescaleDB extension 활성화 (Docker 이미지에 포함됨)
psql -U cowtalk -d cowtalk -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"
```

### Migrations

```bash
# 마이그레이션 실행
npm run db:migrate

# 시드 데이터 삽입 (개발용)
npm run db:seed
```

### Redis 7

개발 환경: 비밀번호 없이 실행
프로덕션: `REDIS_PASSWORD` 환경변수 필수 설정

---

## 4. Build Commands

```bash
# 전체 빌드 (shared -> server -> web 순서)
npm run build

# 개별 빌드
npm run build:shared
npm run build:server
npm run build:web

# 타입 체크만
npm run typecheck

# Lint
npm run lint
npm run lint:fix

# 포맷
npm run format
npm run format:check
```

---

## 5. Production Deploy Script

`scripts/deploy.sh` 실행 순서:

1. `.env` 파일 존재 확인
2. Docker 이미지 빌드 (`docker compose -f docker-compose.prod.yml build`)
3. 기존 컨테이너 정지 + 새 컨테이너 시작 (`up -d`)
4. 서비스 상태 출력

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

### Production URLs

| Service | URL |
|---------|-----|
| Web (Nginx) | `http://localhost:80` |
| API (Express) | `http://localhost:4000` |
| Health Check | `http://localhost:4000/api/health` |

---

## 6. Monitoring

### Health Check

```bash
curl http://localhost:4000/api/health
```

Expected:
```json
{ "success": true, "data": { "status": "ok", "version": "5.0.0" } }
```

### Docker Logs

```bash
# 전체 로그
docker compose -f docker-compose.prod.yml logs -f

# 서비스별 로그
docker compose -f docker-compose.prod.yml logs -f server
docker compose -f docker-compose.prod.yml logs -f postgres
```

### Container Health

PostgreSQL과 Redis 모두 Docker healthcheck가 설정되어 있습니다:
- PostgreSQL: `pg_isready` (10초 간격)
- Redis: `redis-cli ping` (10초 간격)

---

## 7. Troubleshooting

### DB 연결 실패

```bash
# PostgreSQL 상태 확인
docker compose exec postgres pg_isready -U cowtalk

# 수동 접속
docker compose exec postgres psql -U cowtalk -d cowtalk
```

### Redis 연결 실패

```bash
docker compose exec redis redis-cli ping
```

### 포트 충돌

기본 포트: 5432 (PostgreSQL), 6379 (Redis), 4000 (API), 80 (Web)
포트 변경이 필요하면 `docker-compose.yml`의 `ports` 매핑과 `.env`를 함께 수정하세요.
