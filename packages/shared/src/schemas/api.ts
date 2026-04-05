// Zod 스키마 — API 요청/응답 공통

import { z } from 'zod';

// === 공통 ===

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const dateRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
}).refine((d) => d.from <= d.to, { message: 'from must be before to' });

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

// === 인증 ===

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum([
    'farmer', 'veterinarian',
    'government_admin', 'quarantine_officer',
  ]),
  farmIds: z.array(z.string().uuid()).optional(),
});

// === 농장 ===

export const farmQuerySchema = paginationSchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(20), // 농장은 최대 500 (146+ 농장 한 번에 조회)
  regionId: z.string().uuid().optional(),
  status: z.enum(['all', 'active', 'inactive', 'quarantine', 'suspended']).optional(),
  search: z.string().max(100).optional(),
});

export const farmCreateSchema = z.object({
  name: z.string().min(2, '목장명 2자 이상').max(100),
  address: z.string().min(1, '주소 필수'),
  lat: z.coerce.number().min(33).max(39).optional(),
  lng: z.coerce.number().min(124).max(132).optional(),
  capacity: z.coerce.number().int().min(1, '수용 두수 1 이상'),
  ownerName: z.string().max(50).optional(),
  phone: z.string().max(20).optional(),
  regionId: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive', 'quarantine', 'suspended']).default('active'),
});

export const farmUpdateSchema = farmCreateSchema.partial();

export type FarmCreateInput = z.input<typeof farmCreateSchema>;
export type FarmUpdateInput = z.input<typeof farmUpdateSchema>;

// === 동물 ===

export const animalQuerySchema = paginationSchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(20), // 목장별 전체 소 목록 조회
  farmId: z.string().uuid().optional(),
  status: z.enum([
    'active', 'dry', 'pregnant', 'calving', 'sick',
    'quarantine', 'sold', 'deceased',
  ]).optional(),
  breed: z.string().optional(),
  search: z.string().max(100).optional(),
});

export const createAnimalSchema = z.object({
  farmId: z.string().uuid(),
  earTag: z.string().min(1).max(50),
  name: z.string().max(100).optional(),
  breed: z.enum(['holstein', 'jersey', 'hanwoo', 'brown_swiss', 'simmental', 'mixed', 'other']),
  sex: z.enum(['female', 'male']),
  birthDate: z.coerce.date().optional(),
  parity: z.number().int().min(0).default(0),
});

// === 센서 데이터 ===

export const sensorQuerySchema = z.object({
  animalId: z.string().uuid(),
  metricType: z.enum(['temperature', 'activity', 'rumination', 'water_intake', 'ph']).optional(),
  period: z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h'),
});

// === 대시보드 ===

export const dashboardQuerySchema = z.object({
  farmId: z.string().uuid().optional(),
  regionId: z.string().uuid().optional(),
});

// === 피드백 ===

export const createFeedbackSchema = z.object({
  predictionId: z.string().uuid().optional(),
  alertId: z.string().uuid().optional(),
  animalId: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  feedbackType: z.enum([
    'correct', 'incorrect', 'partially',
    'too_early', 'too_late', 'not_actionable',
    // Phase 11 — 세부 피드백 유형
    'estrus_confirmed', 'estrus_false', 'estrus_false_positive',
    'insemination_done', 'pregnancy_confirmed', 'pregnancy_negative',
    'disease_confirmed', 'disease_false', 'disease_excluded',
    'treatment_effective', 'treatment_ineffective', 'treatment_response',
    'alert_useful', 'alert_ignored',
    'alert_acknowledged', 'alert_dismissed', 'alert_false_positive',
    'action_accepted', 'action_rejected',
  ]),
  feedbackValue: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(1000).optional(),
});

// === CowTalk Chat ===

export const chatMessageSchema = z.object({
  question: z.string().min(1).max(2000),
  farmId: z.string().uuid().optional(),
  animalId: z.string().uuid().optional(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
  dashboardContext: z.string().max(5000).optional(),
});

// === 내보내기 ===

export const exportSchema = z.object({
  format: z.enum(['csv', 'xlsx']),
  type: z.enum(['animals', 'predictions', 'alerts', 'sensors', 'feedback']),
  farmId: z.string().uuid().optional(),
  dateRange: dateRangeSchema.optional(),
});

// === API 응답 래퍼 ===

export const apiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: z.record(z.unknown()).optional(),
  });

export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type LoginInput = z.input<typeof loginSchema>;
export type RegisterInput = z.input<typeof registerSchema>;
export type PaginationInput = z.input<typeof paginationSchema>;
export type ChatMessageInput = z.input<typeof chatMessageSchema>;
