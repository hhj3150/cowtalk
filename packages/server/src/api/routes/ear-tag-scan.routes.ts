// 이표 스캔 라우트 — 카메라 촬영 → Claude Vision OCR → 개체 조회

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDb } from '../../config/database.js';
import { animals, farms } from '../../db/schema.js';
import { sql, or, eq } from 'drizzle-orm';
import { callClaudeForVision, isClaudeAvailable } from '../../ai-brain/claude-client.js';
import { logger } from '../../lib/logger.js';

export const earTagScanRouter = Router();

earTagScanRouter.use(authenticate);

// 이미지 크기 제한: 5MB (base64 기준 약 6.67MB 문자열)
const MAX_BASE64_LENGTH = 7 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

interface ScanRequestBody {
  readonly image: string;    // base64 인코딩 이미지
  readonly mimeType: string; // image/jpeg, image/png 등
}

interface AnimalSummary {
  readonly animalId: string;
  readonly earTag: string;
  readonly traceId: string | null;
  readonly name: string | null;
  readonly farmName: string | null;
  readonly status: string;
  readonly breed: string | null;
  readonly birthDate: string | null;
  readonly lactationStatus: string | null;
}

// POST /ear-tag-scan — 이표 사진 → 번호 인식 → 개체 조회
earTagScanRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { image, mimeType } = req.body as ScanRequestBody;

    // 입력 검증
    if (!image || typeof image !== 'string') {
      res.status(400).json({ success: false, error: '이미지가 필요합니다' });
      return;
    }

    if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
      res.status(400).json({ success: false, error: '지원하지 않는 이미지 형식입니다 (JPEG/PNG/WebP)' });
      return;
    }

    if (image.length > MAX_BASE64_LENGTH) {
      res.status(400).json({ success: false, error: '이미지 크기가 5MB를 초과합니다' });
      return;
    }

    // Claude Vision 사용 불가 시 수동 입력 안내
    if (!isClaudeAvailable()) {
      res.status(503).json({
        success: false,
        error: 'AI 서비스를 사용할 수 없습니다. 번호를 직접 입력해 주세요.',
      });
      return;
    }

    // Claude Vision으로 이표 번호 인식
    const visionResult = await callClaudeForVision(image, mimeType);

    if (!visionResult || visionResult.numbers.length === 0) {
      res.json({
        success: true,
        data: {
          recognized: [],
          confidence: 'low',
          animal: null,
          candidates: [],
          message: '이표 번호를 인식하지 못했습니다. 다시 촬영하거나 번호를 직접 입력해 주세요.',
        },
      });
      return;
    }

    // DB에서 인식된 번호로 개체 검색
    const db = getDb();
    const candidates: AnimalSummary[] = [];

    for (const num of visionResult.numbers) {
      if (!num || num.length < 1) continue;

      const pattern = `%${num}%`;
      const results = await db
        .select({
          animalId: animals.animalId,
          earTag: animals.earTag,
          traceId: animals.traceId,
          name: animals.name,
          farmName: farms.name,
          status: animals.status,
          breed: animals.breed,
          birthDate: animals.birthDate,
          lactationStatus: animals.lactationStatus,
        })
        .from(animals)
        .leftJoin(farms, eq(animals.farmId, farms.farmId))
        .where(or(
          sql`${animals.earTag} ILIKE ${pattern}`,
          sql`${animals.traceId} ILIKE ${pattern}`,
        ))
        .limit(10);

      for (const r of results) {
        // 중복 제거
        if (candidates.some((c) => c.animalId === r.animalId)) continue;
        candidates.push({
          animalId: r.animalId,
          earTag: r.earTag,
          traceId: r.traceId,
          name: r.name,
          farmName: r.farmName,
          status: r.status,
          breed: r.breed,
          birthDate: r.birthDate ? String(r.birthDate).slice(0, 10) : null,
          lactationStatus: r.lactationStatus,
        });
      }
    }

    // 가장 정확한 매칭 (완전 일치 우선)
    const exactMatch = candidates.find((c) =>
      visionResult.numbers.some((n) => c.earTag === n || c.traceId === n),
    ) ?? null;

    logger.info({
      recognizedNumbers: visionResult.numbers,
      confidence: visionResult.confidence,
      matchCount: candidates.length,
      exactMatch: exactMatch?.earTag ?? null,
      durationMs: visionResult.durationMs,
    }, 'Ear tag scan completed');

    res.json({
      success: true,
      data: {
        recognized: visionResult.numbers,
        confidence: visionResult.confidence,
        animal: exactMatch,
        candidates: candidates.filter((c) => c.animalId !== exactMatch?.animalId),
        message: exactMatch
          ? `${exactMatch.earTag}번 개체를 찾았습니다`
          : candidates.length > 0
            ? `${String(candidates.length)}개 후보 개체를 찾았습니다`
            : '등록된 개체를 찾지 못했습니다',
      },
    });
  } catch (error) {
    logger.error({ error }, 'Ear tag scan failed');
    next(error);
  }
});

// POST /ear-tag-scan/manual — 수동 번호 입력 → 개체 조회
earTagScanRouter.post('/manual', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { number } = req.body as { number: string };

    if (!number || typeof number !== 'string' || number.trim().length < 1) {
      res.status(400).json({ success: false, error: '번호를 입력해 주세요' });
      return;
    }

    const cleaned = number.replace(/[\s-]/g, '').trim();
    const pattern = `%${cleaned}%`;
    const db = getDb();

    const results = await db
      .select({
        animalId: animals.animalId,
        earTag: animals.earTag,
        traceId: animals.traceId,
        name: animals.name,
        farmName: farms.name,
        status: animals.status,
        breed: animals.breed,
        birthDate: animals.birthDate,
        lactationStatus: animals.lactationStatus,
      })
      .from(animals)
      .leftJoin(farms, eq(animals.farmId, farms.farmId))
      .where(or(
        sql`${animals.earTag} ILIKE ${pattern}`,
        sql`${animals.traceId} ILIKE ${pattern}`,
        sql`${animals.name} ILIKE ${pattern}`,
      ))
      .limit(20);

    const candidates = results.map((r) => ({
      animalId: r.animalId,
      earTag: r.earTag,
      traceId: r.traceId,
      name: r.name,
      farmName: r.farmName,
      status: r.status,
      breed: r.breed,
      birthDate: r.birthDate ? String(r.birthDate).slice(0, 10) : null,
      lactationStatus: r.lactationStatus,
    }));

    const exactMatch = candidates.find((c) =>
      c.earTag === cleaned || c.traceId === cleaned,
    ) ?? null;

    res.json({
      success: true,
      data: {
        recognized: [cleaned],
        confidence: 'manual' as const,
        animal: exactMatch,
        candidates: candidates.filter((c) => c.animalId !== exactMatch?.animalId),
        message: exactMatch
          ? `${exactMatch.earTag}번 개체를 찾았습니다`
          : candidates.length > 0
            ? `${String(candidates.length)}개 후보 개체를 찾았습니다`
            : '등록된 개체를 찾지 못했습니다',
      },
    });
  } catch (error) {
    next(error);
  }
});
