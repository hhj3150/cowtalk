// 수의사 진료센터 (Veterinary Clinical Record Module) — 1단계 라우트
// 개체 중심 진료차트 + 자동 호출 데이터(clinical-context) + 진료 저장/불러오기.
// 권한: 수의사 전용 (requireRole('veterinarian')).

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { ForbiddenError, NotFoundError, BadRequestError } from '../../lib/errors.js';
import { buildClinicalContext } from '../../services/vet/clinical-context.service.js';
import {
  listAccessibleFarms, listFarmAnimals, vetCanAccessFarm,
  saveVisit, listAnimalVisits, getVisitDetail,
  updateVisit, listVisitRevisions, getVisitFarmId,
  getVisitDocumentData, getVetIssuer,
} from '../../services/vet/visit.service.js';
import { structureConversationNote } from '../../services/vet/conversation-note.service.js';
import { buildVetDocument, VET_DOC_TYPES, VET_DOC_TITLES, type VetDocType, type VetDocModel } from '../../services/vet/document-builder.service.js';
import { renderVetDocumentPdf } from '../../services/vet/document-pdf.service.js';

export const vetRouter = Router();

vetRouter.use(authenticate);
vetRouter.use(requireRole('veterinarian'));

// GET /api/vet/farms — 수의사가 접근 가능한 목장 목록
vetRouter.get('/farms', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmIds = req.user?.farmIds ?? [];
    const data = await listAccessibleFarms(farmIds);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /api/vet/farms/:farmId/animals — 목장 내 개체 목록
vetRouter.get('/farms/:farmId/animals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = String(req.params.farmId ?? '');
    const userId = req.user!.userId;
    const farmIds = req.user?.farmIds ?? [];
    if (!(await vetCanAccessFarm(farmId, farmIds, userId))) {
      throw new ForbiddenError('이 목장에 접근 권한이 없습니다.');
    }
    const data = await listFarmAnimals(farmId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /api/vet/farms/:farmId/animals/:animalId/clinical-context — 자동 호출 통합 데이터
vetRouter.get('/farms/:farmId/animals/:animalId/clinical-context', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = String(req.params.farmId ?? '');
    const animalId = String(req.params.animalId ?? '');
    const userId = req.user!.userId;
    const farmIds = req.user?.farmIds ?? [];
    if (!(await vetCanAccessFarm(farmId, farmIds, userId))) {
      throw new ForbiddenError('이 목장에 접근 권한이 없습니다.');
    }
    const ctx = await buildClinicalContext(farmId, animalId);
    if (!ctx) {
      throw new NotFoundError('개체를 찾을 수 없거나 해당 목장 소속이 아닙니다.');
    }
    res.json({ success: true, data: ctx });
  } catch (error) {
    next(error);
  }
});

// GET /api/vet/farms/:farmId/animals/:animalId/visits — 과거 진료기록 불러오기
vetRouter.get('/farms/:farmId/animals/:animalId/visits', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = String(req.params.farmId ?? '');
    const animalId = String(req.params.animalId ?? '');
    const userId = req.user!.userId;
    const farmIds = req.user?.farmIds ?? [];
    if (!(await vetCanAccessFarm(farmId, farmIds, userId))) {
      throw new ForbiddenError('이 목장에 접근 권한이 없습니다.');
    }
    const data = await listAnimalVisits(animalId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

const saveVisitSchema = z.object({
  visitReason: z.string().optional(),
  chiefComplaint: z.string().optional(),
  farmerStatement: z.string().optional(),
  physicalExam: z.string().optional(),
  clinicalFindings: z.string().optional(),
  differentialDiagnosis: z.string().optional(),
  finalDiagnosis: z.string().optional(),
  treatment: z.string().optional(),
  prescription: z.string().optional(),
  medication: z.string().optional(),
  withdrawalPeriod: z.string().optional(),
  prognosis: z.string().optional(),
  followUpDate: z.string().optional(),
  farmerInstruction: z.string().optional(),
  quarantineRequired: z.boolean().optional(),
  veterinarianNotes: z.string().optional(),
  status: z.enum(['draft', 'saved', 'finalized']).optional(),
  inputMethod: z.enum(['manual', 'quick_select', 'voice', 'conversation', 'mixed']).optional(),
  rawConversationNote: z.string().optional(),
  fieldVisitLocation: z.string().optional(),
  aiStructuredNote: z.record(z.unknown()).optional(),
  veterinarianConfirmedAiNote: z.boolean().optional(),
});

// POST /api/vet/farms/:farmId/animals/:animalId/visits — 진료 저장 (snapshot 동결)
vetRouter.post('/farms/:farmId/animals/:animalId/visits', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = String(req.params.farmId ?? '');
    const animalId = String(req.params.animalId ?? '');
    const userId = req.user!.userId;
    const farmIds = req.user?.farmIds ?? [];
    if (!(await vetCanAccessFarm(farmId, farmIds, userId))) {
      throw new ForbiddenError('이 목장에 접근 권한이 없습니다.');
    }
    const parsed = saveVisitSchema.parse(req.body ?? {});
    const result = await saveVisit({
      ...parsed,
      farmId,
      animalId,
      veterinarianId: userId,
    });
    if (!result) {
      throw new BadRequestError('개체를 찾을 수 없거나 해당 목장 소속이 아닙니다.');
    }
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

const conversationNoteSchema = z.object({
  farmId: z.string().uuid(),
  animalId: z.string().uuid(),
  rawNote: z.string().min(1, '진료 내용을 입력하세요').max(5000),
});

// POST /api/vet/ai/conversation-note — 자연어 진료 내용 → 구조화 진료차트 초안
// AI는 정리/초안만. 최종 진단·처방·투약은 수의사가 확인 후 확정.
vetRouter.post('/ai/conversation-note', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { farmId, animalId, rawNote } = conversationNoteSchema.parse(req.body ?? {});
    const userId = req.user!.userId;
    const farmIds = req.user?.farmIds ?? [];
    if (!(await vetCanAccessFarm(farmId, farmIds, userId))) {
      throw new ForbiddenError('이 목장에 접근 권한이 없습니다.');
    }
    const result = await structureConversationNote({ farmId, animalId, rawNote });
    if (!result) {
      throw new BadRequestError('진료기록 정리에 실패했습니다 (개체 확인 불가 또는 AI 엔진 비가용).');
    }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// GET /api/vet/visits/:visitId — 진료 상세 (snapshot 포함)
vetRouter.get('/visits/:visitId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const visitId = String(req.params.visitId ?? '');
    const detail = await getVisitDetail(visitId);
    if (!detail) {
      throw new NotFoundError('진료기록을 찾을 수 없습니다.');
    }
    res.json({ success: true, data: detail });
  } catch (error) {
    next(error);
  }
});

// 3단계 — 진료기록 수정/이력관리

// 수정 가능 필드 (수의사 입력만, snapshot은 동결 유지)
const updateVisitSchema = z.object({
  editReason: z.string().max(500).optional(),
  visitReason: z.string().optional(),
  chiefComplaint: z.string().optional(),
  farmerStatement: z.string().optional(),
  physicalExam: z.string().optional(),
  clinicalFindings: z.string().optional(),
  differentialDiagnosis: z.string().optional(),
  finalDiagnosis: z.string().optional(),
  treatment: z.string().optional(),
  prescription: z.string().optional(),
  medication: z.string().optional(),
  withdrawalPeriod: z.string().optional(),
  prognosis: z.string().optional(),
  followUpDate: z.string().optional(),
  farmerInstruction: z.string().optional(),
  quarantineRequired: z.boolean().optional(),
  veterinarianNotes: z.string().optional(),
  status: z.enum(['draft', 'saved', 'finalized']).optional(),
});

// PATCH /api/vet/visits/:visitId — 진료기록 수정 (수정 전 값 이력 보존)
vetRouter.patch('/visits/:visitId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const visitId = String(req.params.visitId ?? '');
    const userId = req.user!.userId;
    const farmIds = req.user?.farmIds ?? [];
    const farmId = await getVisitFarmId(visitId);
    if (!farmId) {
      throw new NotFoundError('진료기록을 찾을 수 없습니다.');
    }
    if (!(await vetCanAccessFarm(farmId, farmIds, userId))) {
      throw new ForbiddenError('이 진료기록에 접근 권한이 없습니다.');
    }
    const { editReason, ...patch } = updateVisitSchema.parse(req.body ?? {});
    const result = await updateVisit({ visitId, editorId: userId, editReason, patch });
    if (!result) {
      throw new NotFoundError('진료기록을 찾을 수 없습니다.');
    }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// GET /api/vet/visits/:visitId/revisions — 수정 이력 (최신 개정 우선)
vetRouter.get('/visits/:visitId/revisions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const visitId = String(req.params.visitId ?? '');
    const userId = req.user!.userId;
    const farmIds = req.user?.farmIds ?? [];
    const farmId = await getVisitFarmId(visitId);
    if (!farmId) {
      throw new NotFoundError('진료기록을 찾을 수 없습니다.');
    }
    if (!(await vetCanAccessFarm(farmId, farmIds, userId))) {
      throw new ForbiddenError('이 진료기록에 접근 권한이 없습니다.');
    }
    const data = await listVisitRevisions(visitId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// 4단계 — 공식 문서 발행 (진료기록부 / 처방전 / 진단서)

function isVetDocType(v: string): v is VetDocType {
  return (VET_DOC_TYPES as readonly string[]).includes(v);
}

// 문서 모델 + 접근검증 + 발행자 조립 (미리보기/PDF 공용)
async function loadVetDocument(
  visitId: string, docTypeRaw: string, userId: string, farmIds: readonly string[],
): Promise<VetDocModel> {
  if (!isVetDocType(docTypeRaw)) {
    throw new BadRequestError(`지원하지 않는 문서 유형입니다: ${docTypeRaw}`);
  }
  const data = await getVisitDocumentData(visitId);
  if (!data) {
    throw new NotFoundError('진료기록을 찾을 수 없습니다.');
  }
  if (!(await vetCanAccessFarm(data.farmId, farmIds, userId))) {
    throw new ForbiddenError('이 진료기록에 접근 권한이 없습니다.');
  }
  const issuer = await getVetIssuer(userId);
  return buildVetDocument({
    docType: docTypeRaw,
    visit: data.visit,
    snapshot: data.snapshot,
    issuer: { name: issuer?.name ?? '담당 수의사', email: issuer?.email ?? null },
  });
}

// GET /api/vet/visits/:visitId/documents/:docType — 문서 모델(미리보기/프린트용 JSON)
vetRouter.get('/visits/:visitId/documents/:docType', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const visitId = String(req.params.visitId ?? '');
    const docType = String(req.params.docType ?? '');
    const model = await loadVetDocument(visitId, docType, req.user!.userId, req.user?.farmIds ?? []);
    res.json({ success: true, data: model });
  } catch (error) {
    next(error);
  }
});

// GET /api/vet/visits/:visitId/documents/:docType/pdf — PDF 발행(스트리밍 다운로드)
vetRouter.get('/visits/:visitId/documents/:docType/pdf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const visitId = String(req.params.visitId ?? '');
    const docType = String(req.params.docType ?? '');
    const model = await loadVetDocument(visitId, docType, req.user!.userId, req.user?.farmIds ?? []);

    const title = VET_DOC_TITLES[model.doc_type];
    const fileName = `cowtalk_${model.doc_type}_${visitId.slice(0, 8)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${title}_${visitId.slice(0, 8)}.pdf`)}; filename="${fileName}"`);
    await renderVetDocumentPdf(model, res);
  } catch (error) {
    next(error);
  }
});
