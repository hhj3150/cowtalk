// 농장주 수신함 — 수의사가 보낸 공식 문서를 열람·확인.
// 발행→보내기→수신→확인 루프의 수신 측. 권한: farmer 전용.
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { getDb } from '../../config/database.js';
import { userFarmAccess } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import {
  listFarmerDeliveries, getDeliveryRef, acknowledgeDelivery,
} from '../../services/vet/document-delivery.service.js';
import { buildVisitDocumentModel } from '../../services/vet/document-issue.service.js';
import { renderVetDocumentPdf } from '../../services/vet/document-pdf.service.js';
import { VET_DOC_TITLES, type VetDocType } from '../../services/vet/document-builder.service.js';

export const farmerRouter = Router();

farmerRouter.use(authenticate);
farmerRouter.use(requireRole('farmer'));

// 농장주 접근 가능 농장 = 토큰 farmIds ∪ userFarmAccess
async function getFarmerFarmIds(userId: string, tokenFarmIds: readonly string[]): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ farmId: userFarmAccess.farmId })
    .from(userFarmAccess).where(eq(userFarmAccess.userId, userId));
  const set = new Set<string>([...tokenFarmIds, ...rows.map((r) => r.farmId)]);
  return [...set];
}

// GET /api/farmer/documents — 내 농장으로 전달된 문서 목록
farmerRouter.get('/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmIds = await getFarmerFarmIds(req.user!.userId, req.user?.farmIds ?? []);
    const data = await listFarmerDeliveries(farmIds);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// 전달 접근검증 — 해당 문서가 내 농장으로 온 것인지
async function authorizeDelivery(req: Request, deliveryId: string): Promise<{ visitId: string; docType: VetDocType }> {
  const ref = await getDeliveryRef(deliveryId);
  if (!ref) {
    throw new NotFoundError('문서를 찾을 수 없습니다.');
  }
  const farmIds = await getFarmerFarmIds(req.user!.userId, req.user?.farmIds ?? []);
  if (!farmIds.includes(ref.farmId)) {
    throw new ForbiddenError('이 문서에 접근 권한이 없습니다.');
  }
  return { visitId: ref.visitId, docType: ref.docType };
}

// GET /api/farmer/documents/:deliveryId — 문서 미리보기(모델)
farmerRouter.get('/documents/:deliveryId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deliveryId = String(req.params.deliveryId ?? '');
    const { visitId, docType } = await authorizeDelivery(req, deliveryId);
    const built = await buildVisitDocumentModel(visitId, docType);
    if (!built) {
      throw new NotFoundError('문서를 생성할 수 없습니다.');
    }
    res.json({ success: true, data: built.model });
  } catch (error) {
    next(error);
  }
});

// GET /api/farmer/documents/:deliveryId/pdf — PDF 다운로드
farmerRouter.get('/documents/:deliveryId/pdf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deliveryId = String(req.params.deliveryId ?? '');
    const { visitId, docType } = await authorizeDelivery(req, deliveryId);
    const built = await buildVisitDocumentModel(visitId, docType);
    if (!built) {
      throw new NotFoundError('문서를 생성할 수 없습니다.');
    }
    const title = VET_DOC_TITLES[built.model.doc_type];
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${title}_${visitId.slice(0, 8)}.pdf`)}`);
    await renderVetDocumentPdf(built.model, res);
  } catch (error) {
    next(error);
  }
});

// POST /api/farmer/documents/:deliveryId/acknowledge — 수신 확인
farmerRouter.post('/documents/:deliveryId/acknowledge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deliveryId = String(req.params.deliveryId ?? '');
    const { visitId } = await authorizeDelivery(req, deliveryId);
    await acknowledgeDelivery(deliveryId, visitId);
    res.json({ success: true, data: { deliveryId, status: 'acknowledged' } });
  } catch (error) {
    next(error);
  }
});
