// 보고서 생성 라우트 — /report-generate
// POST /generate  → AI 기반 보고서 생성 (docx/xlsx/pptx/pdf)
// GET  /download/:fileId → 생성된 파일 다운로드
// GET  /types → 보고서 유형 및 포맷 목록

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth.js';
import { scopedFarmIds } from '../middleware/rbac.js';
import { scopeReportParams } from '../../services/report/report-scope.js';
import { dbReportScopeResolvers } from '../../services/report/report-scope.db.js';
import { collectReportData } from '../../services/report/dataCollector.js';
import { generateReportContent } from '../../services/report/aiContentGenerator.js';
import { generateDocx } from '../../services/report/generators/docxGenerator.js';
import { generateXlsx } from '../../services/report/generators/xlsxGenerator.js';
import { generatePptx } from '../../services/report/generators/pptxGenerator.js';
import { generatePdf } from '../../services/report/generators/pdfGenerator.js';
import { REPORT_CONFIG } from '../../services/report/config.js';
import type { OutputFormat } from '../../services/report/config.js';
import { logger } from '../../lib/logger.js';
import { kstToday } from '../../lib/kst.js';

export const reportGenerateRouter = Router();
reportGenerateRouter.use(authenticate);

// 출력 디렉토리 보장
if (!fs.existsSync(REPORT_CONFIG.OUTPUT_DIR)) {
  fs.mkdirSync(REPORT_CONFIG.OUTPUT_DIR, { recursive: true });
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
};

const generators: Readonly<Record<string, (content: Record<string, unknown>, path: string) => Promise<void>>> = {
  docx: generateDocx,
  xlsx: generateXlsx,
  pptx: generatePptx,
  pdf: generatePdf,
};

/**
 * POST /api/report-generate/generate
 */
reportGenerateRouter.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      prompt,
      reportType = 'custom',
      outputFormat = 'docx',
      params = {},
    } = req.body as {
      prompt?: string;
      reportType?: string;
      outputFormat?: string;
      params?: Record<string, unknown>;
    };

    if (!prompt) {
      res.status(400).json({ success: false, error: '보고서 요청 내용(prompt)을 입력해주세요.' });
      return;
    }

    const validFormats = REPORT_CONFIG.OUTPUT_FORMATS as readonly string[];
    if (!validFormats.includes(outputFormat)) {
      res.status(400).json({ success: false, error: `지원 포맷: ${validFormats.join(', ')}` });
      return;
    }

    // 0단계: 목장·개체·이력번호가 권한 범위 안인지 (식별자가 없으면 배정 목장으로 한정)
    const scopedReport = await scopeReportParams(
      params as Record<string, string | number | undefined>, scopedFarmIds(req), dbReportScopeResolvers,
    );
    if (!scopedReport.ok) {
      const status = scopedReport.reason === 'not_found' ? 404 : scopedReport.reason === 'farm_required' ? 400 : 403;
      res.status(status).json({ success: false, error: scopedReport.message });
      return;
    }

    // 1단계: DB에서 실제 데이터 수집
    logger.info({ reportType, params: scopedReport.params }, '[Report] Collecting data');
    let dbData: Record<string, unknown>;
    try {
      dbData = await collectReportData(reportType, scopedReport.params);
    } catch (dbErr) {
      logger.warn({ err: dbErr }, '[Report] Data collection warning');
      dbData = { reportMeta: { type: reportType, error: '데이터 수집 일부 실패' } };
    }

    // 2단계: AI로 보고서 콘텐츠 생성
    logger.info('[Report] Generating AI content');
    const reportContent = await generateReportContent({
      reportType: reportType as Parameters<typeof generateReportContent>[0]['reportType'],
      outputFormat: outputFormat as OutputFormat,
      userPrompt: prompt,
      dbData: dbData as Parameters<typeof generateReportContent>[0]['dbData'],
    });

    // 3단계: 파일 생성
    const fileId = uuidv4();
    const dateStr = kstToday().replace(/-/g, '');
    const safeType = reportType.replace(/[^a-zA-Z0-9_]/g, '');
    const fileName = `cowtalk_${safeType}_${dateStr}.${outputFormat}`;
    const outputPath = path.join(REPORT_CONFIG.OUTPUT_DIR, `${fileId}_${fileName}`);

    const generator = generators[outputFormat];
    if (!generator) {
      res.status(400).json({ success: false, error: `생성기 없음: ${outputFormat}` });
      return;
    }
    await generator(reportContent, outputPath);

    logger.info({ fileName }, '[Report] File created');

    // 4단계: 응답
    res.json({
      success: true,
      fileId,
      fileName,
      downloadUrl: `/api/report-generate/download/${fileId}`,
      expiresAt: new Date(Date.now() + REPORT_CONFIG.FILE_RETENTION_HOURS * 3_600_000).toISOString(),
      reportTitle: reportContent['title'] ?? fileName,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/report-generate/download/:fileId
 */
reportGenerateRouter.get('/download/:fileId', (req: Request, res: Response) => {
  const fileId = req.params['fileId'] as string | undefined;
  // 정확한 UUID만 받는다 — 접두어 매칭이라 'a' 한 글자로도 남의 보고서가 내려받아졌다
  if (!fileId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId)) {
    res.status(400).json({ success: false, error: 'fileId가 올바르지 않습니다.' });
    return;
  }

  let files: string[];
  try {
    files = fs.readdirSync(REPORT_CONFIG.OUTPUT_DIR).filter((f) => f.startsWith(`${fileId}_`));
  } catch {
    files = [];
  }

  if (files.length === 0) {
    res.status(404).json({ success: false, error: '파일을 찾을 수 없습니다 (만료 또는 미존재).' });
    return;
  }

  const fullFileName = files[0]!;
  const filePath = path.join(REPORT_CONFIG.OUTPUT_DIR, fullFileName);
  const originalName = fullFileName.replace(`${fileId}_`, '');
  const ext = path.extname(originalName).replace('.', '');

  res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`);
  res.sendFile(filePath);
});

/**
 * GET /api/report-generate/types
 */
reportGenerateRouter.get('/types', (_req: Request, res: Response) => {
  res.json({
    success: true,
    reportTypes: REPORT_CONFIG.REPORT_TYPES,
    outputFormats: REPORT_CONFIG.OUTPUT_FORMATS,
  });
});
