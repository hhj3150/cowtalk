// 소버린 AI 알람 API
// GET /sovereign-alarms?farmId=&limit=30

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { generateSovereignAlarms } from '../../services/sovereign-alarm.service.js';
import { logger } from '../../lib/logger.js';

export const sovereignAlarmRouter = Router();
sovereignAlarmRouter.use(authenticate);

const querySchema = z.object({
  farmId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

sovereignAlarmRouter.get('/', async (req, res, next) => {
  try {
    const { farmId, limit } = querySchema.parse(req.query);
    const alarms = await generateSovereignAlarms(farmId, limit);
    res.json({ success: true, data: { alarms, generatedAt: new Date().toISOString() } });
  } catch (err) {
    logger.error({ err }, 'sovereign alarm error');
    next(err);
  }
});
