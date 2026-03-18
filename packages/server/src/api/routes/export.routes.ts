// 데이터 내보내기 라우트

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { exportSchema } from '@cowtalk/shared';

export const exportRouter = Router();

exportRouter.use(authenticate);

exportRouter.post('/', validate({ body: exportSchema }), (_req, res) => {
  res.json({ success: true, data: { downloadUrl: null, message: 'Export stub' } });
});
