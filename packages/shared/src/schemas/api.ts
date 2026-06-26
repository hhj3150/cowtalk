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

// 이력제번호 검증: 12자리 숫자 (예: 002132665191)
const traceIdRegex = /^\d{12}$/;

export const createAnimalSchema = z.object({
  farmId: z.string().uuid(),
  earTag: z.string().min(1).max(50),
  traceId: z.string().regex(traceIdRegex, '이력제번호는 12자리 숫자여야 합니다').optional(),
  name: z.string().max(100).optional(),
  breed: z.enum(['holstein', 'jersey', 'hanwoo', 'brown_swiss', 'simmental', 'mixed', 'other']),
  breedType: z.enum(['dairy', 'beef']).optional(), // 지정 안 하면 breed로부터 자동 결정
  sex: z.enum(['female', 'male']),
  birthDate: z.coerce.date().optional(),
  parity: z.number().int().min(0).default(0),
  currentDeviceId: z.string().max(100).optional(), // smaXtec 센서 serial
});

// PATCH /animals/:animalId — 모든 필드 선택적 (부분 업데이트)
export const updateAnimalSchema = z.object({
  earTag: z.string().min(1).max(50).optional(),
  traceId: z.string().regex(traceIdRegex, '이력제번호는 12자리 숫자여야 합니다').optional().nullable(),
  name: z.string().max(100).optional().nullable(),
  breed: z.enum(['holstein', 'jersey', 'hanwoo', 'brown_swiss', 'simmental', 'mixed', 'other']).optional(),
  breedType: z.enum(['dairy', 'beef']).optional(),
  sex: z.enum(['female', 'male']).optional(),
  birthDate: z.coerce.date().optional().nullable(),
  parity: z.number().int().min(0).optional(),
  currentDeviceId: z.string().max(100).optional().nullable(),
});

// POST /animals/:animalId/status — 상태 변경 (active/sold/dead/culled/transferred)
export const changeAnimalStatusSchema = z.object({
  status: z.enum(['active', 'sold', 'dead', 'culled', 'transferred']),
  reason: z.string().max(500).optional(),       // 처분 사유
  occurredAt: z.coerce.date().optional(),        // 처분 일자 (미기재 시 now)
  destinationFarmId: z.string().uuid().optional(), // transferred 경우 이동 목적지
});

// POST /animals/:animalId/sensor — 센서 매핑 변경
export const assignSensorSchema = z.object({
  deviceId: z.string().max(100).nullable(), // null = 센서 해제
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

// Vision: 첨부 이미지 — base64 데이터 + MIME 타입. Claude Vision API에 직접 전달.
// 5MB 한도(Claude 사양). 한 메시지에 최대 5장 (자비스급 분석에 충분).
const chatImageSchema = z.object({
  data: z.string().min(1).max(7_500_000), // base64 length ~ 5MB raw * 1.34
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
});

// Files: 첨부 문서 — PDF는 Claude API 네이티브 (document block). Excel·CSV는 서버에서 텍스트로 파싱.
const chatDocumentSchema = z.object({
  data: z.string().min(1).max(15_000_000), // base64 max ~10MB raw
  mimeType: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls (legacy)
    'text/csv',
  ]),
  filename: z.string().min(1).max(255).optional(),
});

export const chatMessageSchema = z.object({
  question: z.string().min(1).max(2000),
  farmId: z.string().uuid().optional(),
  // 지역(그룹) 스코프 — 활성 지역 필터의 농장 id 목록. 집계 도구를 이 농장들로 데이터 레벨 한정.
  farmIds: z.array(z.string().uuid()).max(5000).optional(),
  animalId: z.string().uuid().optional(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
  dashboardContext: z.string().max(5000).optional(),
  // UI 언어 힌트 (사용자가 LangSwitcher에서 선택한 언어).
  // 사용자 입력에 명시적 언어 전환 요청이 없으면 이 언어로 응답하라는 신호로 사용된다.
  uiLang: z.enum(['ko', 'en', 'uz', 'ru', 'mn']).optional(),
  // Vision: 사용자가 첨부한 이미지 (소 사진·진단서 등). Claude Vision으로 분석.
  images: z.array(chatImageSchema).max(5).optional(),
  // Files: 사용자가 첨부한 문서 (PDF·Excel·CSV). PDF는 Claude 네이티브, 나머지는 서버에서 텍스트로.
  documents: z.array(chatDocumentSchema).max(3).optional(),
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
