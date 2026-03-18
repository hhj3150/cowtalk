# CowTalk v5.0 Quick Start

## Prerequisites

- **Node.js** >= 20 (22 권장)
- **Docker** + Docker Compose
- **npm** (Node.js와 함께 설치됨)

---

## 1. Clone & Install

```bash
git clone <repository-url> cowtalk-v5
cd cowtalk-v5
npm install
```

---

## 2. Environment Setup

```bash
cp .env.example .env
```

개발 환경 기본값이 `.env.example`에 설정되어 있으므로 DB/Redis는 그대로 사용 가능합니다.
AI Chat 기능을 사용하려면 `ANTHROPIC_API_KEY`를 설정하세요.

---

## 3. Start Database

```bash
# PostgreSQL 16 (TimescaleDB) + Redis 7 시작
docker compose up -d

# 상태 확인 (healthy 될 때까지 대기)
docker compose ps
```

---

## 4. Database Migration

```bash
# 스키마 마이그레이션
npm run db:migrate

# 개발용 시드 데이터 (선택)
npm run db:seed
```

---

## 5. Run Development Mode

```bash
# 서버 + 웹 동시 실행
npm run dev
```

또는 개별 실행:

```bash
# 터미널 1: API 서버 (hot reload)
npm run dev:server

# 터미널 2: 웹 프론트 (Vite HMR)
npm run dev:web
```

---

## 6. Run Tests

```bash
# 전체 테스트
npm test

# Watch 모드
npm run test:watch

# 커버리지
npm run test:coverage
```

---

## 7. Build

```bash
# 전체 빌드 (shared -> server -> web)
npm run build

# 타입 체크
npm run typecheck

# Lint
npm run lint
```

---

## Access URLs

| Service | URL |
|---------|-----|
| Web (Vite Dev) | http://localhost:5173 |
| API Server | http://localhost:4000 |
| Health Check | http://localhost:4000/api/health |

---

## Project Structure

```
cowtalk-v5/
├── packages/
│   ├── shared/       # 공유 타입, 스키마, 상수
│   ├── server/       # Express 5 API 서버
│   └── web/          # React 18 + Vite SPA
├── scripts/
│   └── deploy.sh     # 프로덕션 배포 스크립트
├── tests/            # 통합 테스트
├── docker-compose.yml       # 개발용 (DB + Redis)
├── docker-compose.prod.yml  # 프로덕션 (전체 스택)
├── .env.example             # 환경변수 템플릿
└── package.json             # 모노레포 루트
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, Zustand, React Query |
| Backend | Express 5, Drizzle ORM, Pino, BullMQ, Socket.IO |
| Database | PostgreSQL 16 + TimescaleDB, Redis 7 |
| AI | Rule-based engines (6) + Anthropic Claude (Chat) |
| Testing | Vitest |
| Deploy | Docker Compose, GitHub Actions |

---

## Common Commands

```bash
npm run dev            # 개발 서버 실행
npm test               # 테스트 실행
npm run build          # 전체 빌드
npm run typecheck      # 타입 체크
npm run lint           # ESLint 검사
npm run lint:fix       # ESLint 자동 수정
npm run format         # Prettier 포맷
npm run db:migrate     # DB 마이그레이션
npm run db:seed        # 시드 데이터
```
