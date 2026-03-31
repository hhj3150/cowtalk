// 축산 뉴스 API 라우트 — GET /api/news

import { Router } from 'express';
import { getLatestNews, refreshNewsCache } from '../../services/news.service.js';
import { logger } from '../../lib/logger.js';

export const newsRouter = Router();

// GET /api/news — 최신 축산 뉴스 (캐시 30분)
newsRouter.get('/', async (_req, res) => {
  try {
    const items = await getLatestNews();
    res.json({ success: true, data: items });
  } catch (err) {
    logger.error({ err }, '[News] API error');
    res.status(500).json({ success: false, error: 'Failed to fetch news' });
  }
});

// POST /api/news/refresh — 캐시 강제 갱신 (관리자용)
newsRouter.post('/refresh', async (_req, res) => {
  try {
    const items = await refreshNewsCache();
    res.json({ success: true, data: items, message: `Refreshed ${items.length} items` });
  } catch (err) {
    logger.error({ err }, '[News] Refresh error');
    res.status(500).json({ success: false, error: 'Failed to refresh news' });
  }
});
