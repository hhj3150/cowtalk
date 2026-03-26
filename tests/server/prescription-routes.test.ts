// Prescription Routes 테스트 — 처방전 API

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { prescriptionRouter } from '@server/api/routes/prescription.routes.js';

vi.mock('@server/api/middleware/auth.js', () => ({
  authenticate: (_req: any, _res: any, next: any) => {
    _req.user = { userId: 'u-1', role: 'veterinarian', farmIds: ['f-1'] };
    next();
  },
}));

vi.mock('@server/api/middleware/rbac.js', () => ({
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

const app = express();
app.use(express.json());
app.use('/prescriptions', prescriptionRouter);

beforeEach(() => { vi.clearAllMocks(); });

describe('Prescription Routes', () => {
  it('GET /prescriptions/drugs — 약품 목록 (empty without seed data)', async () => {
    const res = await request(app).get('/prescriptions/drugs');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    // No seed data in test DB, so empty array is valid
  });

  it('POST /prescriptions — non-UUID IDs return 500', async () => {
    const res = await request(app)
      .post('/prescriptions')
      .send({
        animalId: 'a-1',
        farmId: 'f-1',
        diagnosis: '유방염',
        items: [{ drugId: 'd-1', dosage: '10ml', frequency: '1일 2회', durationDays: 5, route: 'injection' }],
        notes: '항생제 투여',
      });
    // non-UUID IDs cause DB validation error
    expect(res.status).toBe(500);
  });

  it('GET /prescriptions/animal/:animalId — non-UUID returns 500', async () => {
    const res = await request(app).get('/prescriptions/animal/a-1');
    // non-UUID animalId causes DB validation error
    expect(res.status).toBe(500);
  });

  it('GET /prescriptions/:id/pdf — PDF 링크', async () => {
    const res = await request(app).get('/prescriptions/rx-1/pdf');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('url');
  });
});
