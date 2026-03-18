// Express 앱 구성 — Helmet, CORS, Rate Limit, 미들웨어, 라우터

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createApiRouter } from './api/index.js';
import { errorHandler, notFoundHandler } from './api/middleware/error.js';
import { requestLogger } from './api/middleware/request-logger.js';
import { config } from './config/index.js';

export function createApp(): express.Express {
  const app = express();

  // --- 보안 헤더 ---
  app.use(helmet());

  // --- CORS ---
  app.use(cors({
    origin: config.NODE_ENV === 'production'
      ? ['https://cowtalk.kr']
      : ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  }));

  // --- Rate Limiting ---
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
  }));

  // --- Body Parsing ---
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // --- Request Logging ---
  app.use(requestLogger);

  // --- API Routes ---
  app.use('/api', createApiRouter());

  // --- 404 + Error Handling ---
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
