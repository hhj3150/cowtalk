// Phase 1 테스트 — 공유 타입, 상수, 스키마 검증

import { describe, it, expect } from 'vitest';
import {
  COWTALK_VERSION,
  ROLES,
  ROLE_MAP,
  ENGINES,
  ENGINE_MAP,
  ENGINE_IDS,
  SENSOR_NORMAL_RANGES,
  ALERT_THRESHOLDS,
  ESTRUS_WEIGHTS,
  DISEASE_MIN_SCORES,
  URGENCY_HOURS,
  DATA_QUALITY_WEIGHTS,
  hasPermission,
  getPermissionsForRole,
  engineOutputSchema,
  alertSchema,
  loginSchema,
  paginationSchema,
  createFeedbackSchema,
} from '@shared/index';

describe('CowTalk v5 — Phase 1: Shared Package', () => {
  describe('Version', () => {
    it('should export correct version', () => {
      expect(COWTALK_VERSION).toBe('5.0.0');
    });
  });

  describe('Roles', () => {
    it('should define exactly 6 roles', () => {
      expect(ROLES).toHaveLength(6);
    });

    it('should have all role IDs', () => {
      const roleIds = ROLES.map((r) => r.role);
      expect(roleIds).toContain('farmer');
      expect(roleIds).toContain('veterinarian');
      expect(roleIds).toContain('inseminator');
      expect(roleIds).toContain('government_admin');
      expect(roleIds).toContain('quarantine_officer');
      expect(roleIds).toContain('feed_company');
    });

    it('should have Korean labels for all roles', () => {
      for (const role of ROLES) {
        expect(role.labelKo).toBeTruthy();
      }
    });

    it('should look up roles by ID', () => {
      const farmer = ROLE_MAP.farmer;
      expect(farmer.labelKo).toBe('농장주');
      expect(farmer.scope).toBe('farm');
    });
  });

  describe('Permissions', () => {
    it('should allow farmer to read predictions', () => {
      expect(hasPermission('farmer', 'prediction', 'read')).toBe(true);
    });

    it('should deny farmer from reading regional data', () => {
      expect(hasPermission('farmer', 'regional', 'read')).toBe(false);
    });

    it('should allow government_admin full user access', () => {
      expect(hasPermission('government_admin', 'user', 'create')).toBe(true);
      expect(hasPermission('government_admin', 'user', 'delete')).toBe(true);
    });

    it('should deny feed_company from creating animals', () => {
      expect(hasPermission('feed_company', 'animal', 'create')).toBe(false);
    });

    it('should return permissions for a role', () => {
      const permissions = getPermissionsForRole('veterinarian');
      expect(permissions.length).toBeGreaterThan(0);
      const resources = permissions.map((p) => p.resource);
      expect(resources).toContain('animal');
      expect(resources).toContain('regional');
    });
  });

  describe('Engines', () => {
    it('should define 5 engines', () => {
      expect(ENGINES).toHaveLength(5);
    });

    it('should have correct engine IDs', () => {
      expect(ENGINE_IDS).toEqual(['estrus', 'disease', 'pregnancy', 'herd', 'regional']);
    });

    it('should look up engines by ID', () => {
      const estrus = ENGINE_MAP.estrus;
      expect(estrus.labelKo).toBe('발정 감지');
      expect(estrus.modelType).toBe('rule_based');
    });
  });

  describe('Thresholds (v4 이식)', () => {
    it('should have 5 sensor normal ranges', () => {
      expect(SENSOR_NORMAL_RANGES).toHaveLength(5);
    });

    it('should have correct temperature range', () => {
      const tempRange = SENSOR_NORMAL_RANGES.find((r) => r.metricType === 'temperature');
      expect(tempRange?.min).toBe(38.0);
      expect(tempRange?.max).toBe(39.3);
    });

    it('should have alert thresholds', () => {
      expect(ALERT_THRESHOLDS.temperature.fever).toBe(40.0);
      expect(ALERT_THRESHOLDS.rumination.dropPercent).toBe(25);
    });

    it('should have estrus weights summing to 1.0', () => {
      const sum = ESTRUS_WEIGHTS.sensorSignature +
        ESTRUS_WEIGHTS.eventHistory +
        ESTRUS_WEIGHTS.cyclePrediction;
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should have 7 disease min scores', () => {
      expect(Object.keys(DISEASE_MIN_SCORES)).toHaveLength(7);
    });

    it('should have urgency hours', () => {
      expect(URGENCY_HOURS.critical).toBe(2);
      expect(URGENCY_HOURS.monitor).toBe(48);
    });

    it('should have data quality weights summing to 1.0', () => {
      const sum = Object.values(DATA_QUALITY_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });
  });

  describe('Zod Schemas', () => {
    it('should validate a correct engine output', () => {
      const validOutput = {
        predictionId: '550e8400-e29b-41d4-a716-446655440000',
        engineType: 'estrus',
        farmId: '550e8400-e29b-41d4-a716-446655440001',
        animalId: '550e8400-e29b-41d4-a716-446655440002',
        timestamp: new Date(),
        probability: 0.85,
        confidence: 0.72,
        confidenceLevel: 'high',
        severity: 'medium',
        rankScore: 0.78,
        predictionLabel: '발정 의심',
        explanationText: '체온 상승 + 활동량 증가 패턴',
        contributingFeatures: [
          { featureName: 'temperature', value: 39.5, weight: 0.4, direction: 'positive', description: '체온 0.5°C 상승' },
        ],
        recommendedAction: '수정사 호출 권장',
        modelVersion: '5.0.0',
        roleSpecific: {
          farmer: { summary: '발정 의심', details: '', priority: 'medium', actionItems: ['수정사 연락'], showMetrics: ['temperature'] },
        },
        dataQuality: { score: 85, grade: 'B', issues: [] },
        featureSnapshotId: null,
      };

      const result = engineOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid engine output (missing probability)', () => {
      const invalid = {
        predictionId: '550e8400-e29b-41d4-a716-446655440000',
        engineType: 'estrus',
        // missing required fields
      };
      const result = engineOutputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should validate login schema', () => {
      expect(loginSchema.safeParse({ email: 'test@cowtalk.kr', password: 'password123' }).success).toBe(true);
      expect(loginSchema.safeParse({ email: 'invalid', password: '123' }).success).toBe(false);
    });

    it('should validate pagination schema with defaults', () => {
      const result = paginationSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.sortDir).toBe('desc');
    });

    it('should validate feedback schema', () => {
      const valid = {
        farmId: '550e8400-e29b-41d4-a716-446655440001',
        feedbackType: 'correct',
        notes: '맞는 판단',
      };
      expect(createFeedbackSchema.safeParse(valid).success).toBe(true);
    });

    it('should validate alert schema', () => {
      const validAlert = {
        alertId: '550e8400-e29b-41d4-a716-446655440000',
        alertType: 'health_risk',
        engineType: 'disease',
        animalId: '550e8400-e29b-41d4-a716-446655440001',
        farmId: '550e8400-e29b-41d4-a716-446655440002',
        predictionId: null,
        priority: 'high',
        status: 'new',
        title: '건강 이상 경고',
        explanation: '체온 40.2°C 감지',
        recommendedAction: '수의사 진료 필요',
        dedupKey: 'health_risk_animal1_2026-03-17',
        cooldownUntil: null,
        expiresAt: null,
      };
      expect(alertSchema.safeParse(validAlert).success).toBe(true);
    });
  });
});
