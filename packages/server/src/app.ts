// Express 앱 구성 — Helmet, CORS, Rate Limit, 미들웨어, 라우터

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { RedisFallbackStore } from './lib/rate-limit-store.js';
import { getRedis } from './serving/cache.service.js';
import { createApiRouter } from './api/index.js';
import { errorHandler, notFoundHandler } from './api/middleware/error.js';
import { requestLogger } from './api/middleware/request-logger.js';
import { auditLogger } from './api/middleware/audit-logger.js';
import { config } from './config/index.js';

export function createApp(): express.Express {
  const app = express();

  // --- 리버스 프록시 (Railway/Netlify) ---
  // 미설정 시 req.ip가 프록시 IP로 고정되어 rate limit이 전체 사용자에 합산되고,
  // express-rate-limit이 ERR_ERL_UNEXPECTED_X_FORWARDED_FOR 경고를 반복 출력한다.
  // 1 = 첫 번째 프록시 홉(Railway 엣지)만 신뢰 — X-Forwarded-For 위조 방지.
  app.set('trust proxy', 1);

  // --- 보안 헤더 ---
  app.use(helmet());

  // --- CORS ---
  app.use(cors({
    origin: config.NODE_ENV === 'production'
      ? [/\.netlify\.app$/, /cowtalk\.kr$/, /cowtalk\.netlify\.app$/]
      : ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  }));

  // --- Rate Limiting (전역) ---
  app.use(rateLimit({
    windowMs: 30 * 60 * 1000, // 30분
    max: 1000,
    store: new RedisFallbackStore('global', getRedis), // OPS-12: 레플리카·재시작 공유 카운터
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
  }));

  // --- Auth 엔드포인트 전용 엄격한 Rate Limit (브루트포스 방지) ---
  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 10,
    store: new RedisFallbackStore('auth', getRedis),
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'AUTH_RATE_LIMITED', message: '인증 시도가 너무 많습니다. 15분 후 다시 시도해주세요.' } },
  });
  app.use('/api/auth/login', authRateLimit);
  app.use('/api/auth/register', authRateLimit);

  // SEC-17: 공개 가입·토큰 갱신도 속도 제한 (예전: 제한 없음 → 농장 행 무제한 생성, 이메일 존재 확인 반복)
  app.use('/api/auth/onboarding', rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    store: new RedisFallbackStore('onboarding', getRedis),
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'AUTH_RATE_LIMITED', message: '가입 시도가 너무 많습니다. 1시간 후 다시 시도해주세요.' } },
  }));
  app.use('/api/auth/refresh', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    store: new RedisFallbackStore('refresh', getRedis),
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'AUTH_RATE_LIMITED', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' } },
  }));

  // --- Body Parsing ---
  // 50mb — Vision 첨부 이미지(최대 5장 × base64 ~7.5MB) 수용
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));

  // --- Request Logging + Audit Logging ---
  app.use(requestLogger);
  app.use(auditLogger);

  // --- API Routes ---
  app.use('/api', createApiRouter());

  // --- 404 + Error Handling ---
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
