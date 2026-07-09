// 데이터 내보내기 라우트 — CSV/XLSX 실파일 응답 (downloadUrl:null 스텁 대체)
// GET /export/:target?format=csv|excel&days=&farmId=
// 스코프: JWT farmIds 기준 강제 실링 — 소속 농장 밖 데이터 내보내기 차단

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { scopedFarmIds, resolveScopedFarmIds } from '../middleware/rbac.js';
import {
  buildExportSheet,
  isExportTarget,
  parseExportFormat,
  toCsv,
  toXlsxBuffer,
} from '../../services/export/export.service.js';
import { logger } from '../../lib/logger.js';

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

export const exportRouter = Router();

exportRouter.use(authenticate);

exportRouter.get('/:target', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetRaw = req.params.target;
    const target = typeof targetRaw === 'string' ? targetRaw : '';
    if (!isExportTarget(target)) {
      res.status(400).json({ success: false, error: `지원하지 않는 내보내기 대상입니다: ${target}` });
      return;
    }
    const format = parseExportFormat(req.query.format);
    const daysRaw = Number(req.query.days);
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(Math.floor(daysRaw), MAX_DAYS) : DEFAULT_DAYS;

    const requested = typeof req.query.farmId === 'string' && req.query.farmId ? [req.query.farmId] : [];
    const effective = resolveScopedFarmIds(requested, scopedFarmIds(req));

    const sheet = await buildExportSheet(target, {
      farmIds: effective.length > 0 ? effective : undefined,
      days,
    });

    const filename = `cowtalk_${target}_${new Date().toISOString().slice(0, 10)}.${format}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (sheet.truncated) {
      res.setHeader('X-Export-Truncated', 'true');
    }

    if (format === 'xlsx') {
      const buffer = await toXlsxBuffer(sheet);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } else {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.send(toCsv(sheet));
    }

    logger.info(
      { target, format, rows: sheet.rows.length, truncated: sheet.truncated, userId: req.user?.userId },
      '[Export] 데이터 내보내기',
    );
  } catch (error) {
    next(error);
  }
});
