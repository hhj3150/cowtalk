// Zod 스키마 — AI 예측 출력 검증

import { z } from 'zod';

const severitySchema = z.enum(['low', 'medium', 'high', 'critical']);
const confidenceLevelSchema = z.enum(['very_low', 'low', 'medium', 'high', 'very_high']);
const engineTypeSchema = z.enum(['estrus', 'disease', 'pregnancy', 'herd', 'regional']);

const contributingFeatureSchema = z.object({
  featureName: z.string().min(1),
  value: z.number(),
  weight: z.number().min(0).max(1),
  direction: z.enum(['positive', 'negative', 'neutral']),
  description: z.string().min(1),
});

const roleSpecificOutputSchema = z.object({
  summary: z.string().min(1),
  details: z.string(),
  priority: severitySchema,
  actionItems: z.array(z.string()),
  showMetrics: z.array(z.string()),
});

const dataQualitySchema = z.object({
  score: z.number().min(0).max(100),
  grade: z.enum(['A', 'B', 'C', 'D', 'F']),
  issues: z.array(z.string()),
});

export const engineOutputSchema = z.object({
  predictionId: z.string().uuid(),
  engineType: engineTypeSchema,
  farmId: z.string().uuid(),
  animalId: z.string().uuid(),
  timestamp: z.coerce.date(),
  probability: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  confidenceLevel: confidenceLevelSchema,
  severity: severitySchema,
  rankScore: z.number().min(0),
  predictionLabel: z.string().min(1),
  explanationText: z.string().min(1),
  contributingFeatures: z.array(contributingFeatureSchema).min(1),
  recommendedAction: z.string().min(1),
  modelVersion: z.string().min(1),
  roleSpecific: z.record(z.string(), roleSpecificOutputSchema),
  dataQuality: dataQualitySchema,
  featureSnapshotId: z.string().uuid().nullable(),
});

export const estrusOutputSchema = engineOutputSchema.extend({
  engineType: z.literal('estrus'),
  stage: z.enum(['pre_estrus', 'estrus', 'post_estrus', 'none']),
  optimalInseminationWindow: z
    .object({ start: z.coerce.date(), end: z.coerce.date() })
    .nullable(),
  sensorSignatureScore: z.number().min(0).max(1),
  eventScore: z.number().min(0).max(1),
  cycleScore: z.number().min(0).max(1),
});

export const diseaseOutputSchema = engineOutputSchema.extend({
  engineType: z.literal('disease'),
  suspectedDiseases: z.array(
    z.object({
      diseaseType: z.enum([
        'mastitis', 'ketosis', 'milk_fever', 'acidosis',
        'pneumonia', 'metritis', 'lameness',
      ]),
      probability: z.number().min(0).max(1),
      matchingSymptoms: z.array(z.string()),
    }),
  ),
  urgencyHours: z.number().positive(),
});

export const pregnancyOutputSchema = engineOutputSchema.extend({
  engineType: z.literal('pregnancy'),
  daysPostInsemination: z.number().int().nonnegative().nullable(),
  stabilityScore: z.number().min(0).max(1),
  estimatedDueDate: z.coerce.date().nullable(),
});

export const fusionResultSchema = z.object({
  fusionId: z.string().uuid(),
  animalId: z.string().uuid(),
  farmId: z.string().uuid(),
  timestamp: z.coerce.date(),
  primaryInterpretation: engineOutputSchema,
  secondaryInterpretations: z.array(engineOutputSchema),
  conflictResolved: z.boolean(),
  conflictDescription: z.string().nullable(),
  finalSeverity: severitySchema,
  finalRankScore: z.number().min(0),
});

export type EngineOutputInput = z.input<typeof engineOutputSchema>;
export type EstrusOutputInput = z.input<typeof estrusOutputSchema>;
export type DiseaseOutputInput = z.input<typeof diseaseOutputSchema>;
