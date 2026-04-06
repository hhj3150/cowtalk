// 감별진단 REST API — 개체별 질병 확률 순위 + 센서 근거 + 확인검사 가이드

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDifferentialDiagnosis } from '../../services/vet/differential-diagnosis.service.js';
import { logger } from '../../lib/logger.js';

export const diagnosisRouter = Router();

diagnosisRouter.use(authenticate);

// GET /diagnosis/:animalId?symptoms=유방부종,식욕감소
diagnosisRouter.get('/:animalId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const animalId = String(req.params.animalId ?? '');
    if (!animalId) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'animalId는 필수입니다.' } });
      return;
    }
    const symptomsParam = req.query.symptoms;
    const symptoms: readonly string[] | undefined =
      typeof symptomsParam === 'string' && symptomsParam.length > 0
        ? symptomsParam.split(',').map((s) => s.trim())
        : undefined;

    const result = await getDifferentialDiagnosis(animalId, symptoms);

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ err: error, animalId: req.params.animalId }, 'Differential diagnosis failed');
    next(error);
  }
});
