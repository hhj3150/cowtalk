// 소버린 AI 알람 API
// GET /sovereign-alarms?farmId=&limit=30

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { generateSovereignAlarms, saveSovereignAlarmLabel, getSovereignAlarmAccuracy } from '../../services/sovereign-alarm.service.js';
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

const labelSchema = z.object({
  alarmSignature:    z.string().min(1),
  animalId:          z.string().uuid(),
  farmId:            z.string().uuid(),
  alarmType:         z.string().min(1),
  predictedSeverity: z.string().min(1),
  verdict:           z.enum(['confirmed', 'false_positive', 'modified']),
  notes:             z.string().optional(),
});

sovereignAlarmRouter.post('/label', async (req, res, next) => {
  try {
    const input = labelSchema.parse(req.body);
    await saveSovereignAlarmLabel(input);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'sovereign alarm label error');
    next(err);
  }
});

sovereignAlarmRouter.get('/accuracy', async (req, res, next) => {
  try {
    const farmId = z.string().uuid().parse(req.query.farmId);
    const accuracy = await getSovereignAlarmAccuracy(farmId);
    res.json({ success: true, data: accuracy });
  } catch (err) {
    logger.error({ err }, 'sovereign alarm accuracy error');
    next(err);
  }
});
