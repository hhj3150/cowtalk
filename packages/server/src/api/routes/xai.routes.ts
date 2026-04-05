// XAI (설명가능 AI) 라우트 — AI 판단 근거 구조화 제공

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getDb } from '../../config/database.js';
import { animals, farms } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { buildAnimalProfile, buildFarmProfile } from '../../pipeline/profile-builder.js';
import { interpretAnimal, interpretFarm } from '../../ai-brain/claude-interpreter.js';
import { buildAnimalExplanation, buildFarmExplanation } from '../../ai-brain/xai/explanation-builder.js';
import type { Role } from '@cowtalk/shared';

export const xaiRouter = Router();
xaiRouter.use(authenticate);

const animalQuerySchema = {
  query: z.object({
    animalId: z.string().uuid('animalId는 UUID여야 합니다'),
    role: z.enum(['farmer', 'veterinarian', 'quarantine_officer', 'government_admin']).optional(),
  }),
};

const farmQuerySchema = {
  query: z.object({
    farmId: z.string().uuid('farmId는 UUID여야 합니다'),
    role: z.enum(['farmer', 'veterinarian', 'quarantine_officer', 'government_admin']).optional(),
  }),
};

// GET /xai/animal — 개체 AI 판단 근거 조회
xaiRouter.get('/animal', validate(animalQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { animalId, role = 'farmer' } = req.query as { animalId: string; role?: Role };
    const db = getDb();

    const [animal] = await db.select().from(animals).where(eq(animals.animalId, animalId)).limit(1);
    if (!animal) {
      res.status(404).json({ success: false, error: '개체를 찾을 수 없습니다.' });
      return;
    }

    const profile = await buildAnimalProfile(animalId);
    if (!profile) {
      res.status(404).json({ success: false, error: '개체 프로파일을 생성할 수 없습니다.' });
      return;
    }
    const interpretation = await interpretAnimal(profile, role);
    const explanation = buildAnimalExplanation(interpretation);

    res.json({ success: true, data: explanation });
  } catch (error) {
    next(error);
  }
});

// GET /xai/farm — 농장 AI 판단 근거 조회
xaiRouter.get('/farm', validate(farmQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { farmId, role = 'farmer' } = req.query as { farmId: string; role?: Role };
    const db = getDb();

    const [farm] = await db.select().from(farms).where(eq(farms.farmId, farmId)).limit(1);
    if (!farm) {
      res.status(404).json({ success: false, error: '농장을 찾을 수 없습니다.' });
      return;
    }

    const profile = await buildFarmProfile(farmId);
    if (!profile) {
      res.status(404).json({ success: false, error: '농장 프로파일을 생성할 수 없습니다.' });
      return;
    }
    const interpretation = await interpretFarm(profile, role);
    const explanation = buildFarmExplanation(interpretation);

    res.json({ success: true, data: explanation });
  } catch (error) {
    next(error);
  }
});

// GET /xai/system — AI 시스템 투명성 정보 (공모사업 심사용)
xaiRouter.get('/system', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      name: 'CowTalk AI Engine v5.0',
      description: 'smaXtec 위내센서 + 국가 공공데이터 + Claude LLM 융합 해석 엔진',
      components: [
        {
          name: 'Claude AI 해석 엔진',
          model: 'claude-opus-4-5 / claude-sonnet-4-6',
          provider: 'Anthropic',
          role: '센서 데이터 + 공공데이터 → 자연어 해석 + 역할별 액션 생성',
          fallback: 'v4 룰 엔진 (로컬)',
        },
        {
          name: 'v4 룰 엔진',
          model: 'Rule-based (v4 이식)',
          provider: 'CowTalk (자체 개발)',
          role: 'Claude 불가 시 fallback 분석 + 보조 특성 추출',
          fallback: '없음 (최후 방어선)',
        },
        {
          name: 'smaXtec 발정 감지',
          model: 'smaXtec 독자 알고리즘',
          provider: 'smaXtec GmbH (오스트리아)',
          role: '위내온도·활동·반추 → 발정 이벤트 (신뢰도 95%+)',
          fallback: 'CowTalk v4 발정 엔진',
        },
      ],
      dataGovernance: {
        dataRetention: '원본 센서 데이터 영구 보존, 보고서 파일 48시간 자동 삭제',
        auditLogging: '민감 경로 접근 이력 Pino 구조화 로그로 기록',
        encryptionInTransit: 'HTTPS (TLS 1.3)',
        authMethod: 'JWT (RS256, 15분 만료) + Refresh Token (7일)',
      },
      accuracy: {
        estrusDetection: '95%+ (smaXtec 공인)',
        diseaseEarlyDetection: '목표 85%+ (피드백 루프 학습 중)',
        breedingRecommendation: '수태율 개선 목표 10%p (해돋이목장 실증)',
      },
      explainabilityFeatures: [
        '모든 AI 판단에 contributingFactors (기여 요인) 제공',
        '신뢰도 점수 (confidenceScore 0~1) 명시',
        '데이터 출처 추적 (dataSources)',
        '불확실성 경고 (limitations)',
        'v4 룰엔진/Claude LLM 구분 표시',
      ],
    },
  });
});
