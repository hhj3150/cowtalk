// smaXtec Notes API 탐색용 디버그 라우트
// 목적: todos / public events / integration events 중 어느 API에서
//       노트(카테고리, note_event, diagnosis_key 등)를 가져올 수 있는지 확인
//
// 엔드포인트:
//   GET /api/smaxtec-notes/debug           — 3개 API 동시 조회 결과 비교
//   GET /api/smaxtec-notes/todos           — Todos 목록
//   GET /api/smaxtec-notes/events          — Public Events 목록
//   GET /api/smaxtec-notes/integration-events — Integration Events 목록
//   GET /api/smaxtec-notes/note/:noteId    — 개별 노트 상세

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { SmaxtecApiClient } from '../../pipeline/connectors/smaxtec.connector.js';
import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';

export const smaxtecNotesRouter = Router();

// org_id — smaXtec 조직 ID (환경변수 or 기본값)
const ORG_ID = process.env.SMAXTEC_ORG_ID ?? '58ae7d8098873db8993c5853';

function getClient(): SmaxtecApiClient {
  const email = config.SMAXTEC_EMAIL ?? process.env.SMAXTEC_EMAIL;
  const password = config.SMAXTEC_PASSWORD ?? process.env.SMAXTEC_PASSWORD;
  if (!email || !password) {
    throw new Error('SMAXTEC_EMAIL / SMAXTEC_PASSWORD 환경변수 미설정');
  }
  return new SmaxtecApiClient(email, password);
}

// ===========================
// GET /debug — 3개 API 동시 비교
// ===========================

smaxtecNotesRouter.get('/debug', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getClient();
    const orgId = ORG_ID;

    const [todos, publicEvents, integrationEvents] = await Promise.allSettled([
      client.getTodos(orgId),
      client.getPublicEvents(orgId, 10),
      client.getIntegrationEvents(orgId, 10),
    ]);

    const result = {
      orgId,
      todos: {
        status: todos.status,
        data: todos.status === 'fulfilled' ? todos.value : String(todos.reason),
      },
      publicEvents: {
        status: publicEvents.status,
        data: publicEvents.status === 'fulfilled' ? publicEvents.value : String(publicEvents.reason),
      },
      integrationEvents: {
        status: integrationEvents.status,
        data: integrationEvents.status === 'fulfilled' ? integrationEvents.value : String(integrationEvents.reason),
      },
    };

    logger.info({ orgId }, '[smaxtec-notes] debug 조회 완료');
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /todos
// ===========================

smaxtecNotesRouter.get('/todos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getClient();
    const orgId = (req.query.orgId as string | undefined) ?? ORG_ID;
    const done = req.query.done !== undefined ? req.query.done === 'true' : undefined;
    const data = await client.getTodos(orgId, done);
    res.json({ success: true, orgId, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /events
// ===========================

smaxtecNotesRouter.get('/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getClient();
    const orgId = (req.query.orgId as string | undefined) ?? ORG_ID;
    const limit = Number(req.query.limit ?? 20);
    const data = await client.getPublicEvents(orgId, limit);
    res.json({ success: true, orgId, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /integration-events
// ===========================

smaxtecNotesRouter.get('/integration-events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getClient();
    const orgId = (req.query.orgId as string | undefined) ?? ORG_ID;
    const limit = Number(req.query.limit ?? 20);
    const data = await client.getIntegrationEvents(orgId, limit);
    res.json({ success: true, orgId, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /note/:noteId
// ===========================

smaxtecNotesRouter.get('/note/:noteId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getClient();
    const noteId = String(req.params['noteId'] ?? '');
    if (!noteId) { res.status(400).json({ success: false, error: 'noteId required' }); return; }
    const data = await client.getNote(noteId);
    res.json({ success: true, noteId, data });
  } catch (err) {
    next(err);
  }
});
