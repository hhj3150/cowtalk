// 헬스체크 라우트

import { Router } from 'express';
import { COWTALK_VERSION } from '@cowtalk/shared';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      version: COWTALK_VERSION,
      timestamp: new Date().toISOString(),
    },
  });
});
