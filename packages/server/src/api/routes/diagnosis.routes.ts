// 감별진단 REST API — 개체별 질병 확률 순위 + 센서 근거 + 확인검사 가이드

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { sql } from 'drizzle-orm';
import { authenticate } from '../middleware/auth.js';
import { getDifferentialDiagnosis } from '../../services/vet/differential-diagnosis.service.js';
import { getDb } from '../../config/database.js';
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

    // 히스토리 저장 (비동기 — 응답 차단 안 함)
    const userId = (req as unknown as { user?: { userId?: string } }).user?.userId;
    saveDiagnosisHistory(animalId, userId, symptoms ?? [], result).catch((err) => {
      logger.warn({ err, animalId }, 'Failed to save diagnosis history');
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ err: error, animalId: req.params.animalId }, 'Differential diagnosis failed');
    next(error);
  }
});

// GET /diagnosis/:animalId/history — 개체별 진단 이력 조회
diagnosisRouter.get('/:animalId/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const animalId = String(req.params.animalId ?? '');
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const db = getDb();
    const rows = await db.execute(sql`
      SELECT id, symptoms, candidates, urgency_level, data_quality,
             top_disease, top_probability, created_at
      FROM diagnosis_history
      WHERE animal_id = ${animalId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error({ err: error, animalId: req.params.animalId }, 'Diagnosis history query failed');
    next(error);
  }
});

// ── 히스토리 저장 헬퍼 ──

interface DiagnosisResult {
  readonly candidates: readonly { readonly disease: string; readonly probability: number }[];
  readonly urgencyLevel: string;
  readonly dataQuality: string;
  readonly farmId?: string;
}

async function saveDiagnosisHistory(
  animalId: string,
  userId: string | undefined,
  symptoms: readonly string[],
  result: DiagnosisResult,
): Promise<void> {
  const db = getDb();
  const topCandidate = result.candidates[0];

  await db.execute(sql`
    INSERT INTO diagnosis_history (
      animal_id, farm_id, requested_by, symptoms, candidates,
      urgency_level, data_quality, top_disease, top_probability
    ) VALUES (
      ${animalId},
      ${result.farmId ?? null},
      ${userId ?? null},
      ${symptoms.length > 0 ? sql.raw(`ARRAY[${symptoms.map((s) => `'${s.replace(/'/g, "''")}'`).join(',')}]::text[]`) : sql`'{}'::text[]`},
      ${JSON.stringify(result.candidates)}::jsonb,
      ${result.urgencyLevel},
      ${result.dataQuality},
      ${topCandidate?.disease ?? null},
      ${topCandidate?.probability ?? null}
    )
  `);
}
