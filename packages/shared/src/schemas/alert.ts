// Zod 스키마 — 알림 출력 검증

import { z } from 'zod';

export const alertTypeSchema = z.enum([
  'health_risk',
  'estrus_candidate',
  'feeding_metabolic_risk',
  'productivity_drop',
  'herd_anomaly',
  'regional_warning',
  'system',
]);

export const alertStatusSchema = z.enum([
  'new', 'acknowledged', 'in_progress', 'resolved', 'dismissed', 'expired',
]);

export const alertPrioritySchema = z.enum(['critical', 'high', 'medium', 'low']);

export const alertSchema = z.object({
  alertId: z.string().uuid(),
  alertType: alertTypeSchema,
  engineType: z.enum(['estrus', 'disease', 'pregnancy', 'herd', 'regional']).nullable(),
  animalId: z.string().uuid().nullable(),
  farmId: z.string().uuid(),
  predictionId: z.string().uuid().nullable(),
  priority: alertPrioritySchema,
  status: alertStatusSchema,
  title: z.string().min(1),
  explanation: z.string().min(1),
  recommendedAction: z.string().min(1),
  dedupKey: z.string().min(1),
  cooldownUntil: z.coerce.date().nullable(),
  expiresAt: z.coerce.date().nullable(),
});

export const alertFilterSchema = z.object({
  farmId: z.string().uuid().optional(),
  animalId: z.string().uuid().optional(),
  alertType: alertTypeSchema.optional(),
  priority: alertPrioritySchema.optional(),
  status: alertStatusSchema.optional(),
  engineType: z.enum(['estrus', 'disease', 'pregnancy', 'herd', 'regional']).optional(),
  dateRange: z.object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  }).optional(),
});

export const updateAlertStatusSchema = z.object({
  status: alertStatusSchema,
  notes: z.string().max(1000).optional(),
});

export type AlertInput = z.input<typeof alertSchema>;
export type AlertFilterInput = z.input<typeof alertFilterSchema>;
