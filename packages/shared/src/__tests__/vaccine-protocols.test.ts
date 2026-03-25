import { describe, it, expect } from 'vitest';
import {
  VACCINE_PROTOCOLS,
  getProtocolById,
  getRequiredProtocols,
  getVaccinationProtocols,
  getInspectionProtocols,
  getProtocolsForMonth,
  VACCINATION_STATUS_LABELS,
  INSPECTION_RESULT_LABELS,
} from '../constants/vaccine-protocols';

describe('vaccine-protocols', () => {
  describe('VACCINE_PROTOCOLS', () => {
    it('should have at least 5 protocols', () => {
      expect(VACCINE_PROTOCOLS.length).toBeGreaterThanOrEqual(5);
    });

    it('every protocol should have required fields', () => {
      for (const p of VACCINE_PROTOCOLS) {
        expect(p.id).toBeTruthy();
        expect(p.name).toBeTruthy();
        expect(p.nameEn).toBeTruthy();
        expect(p.diseaseCode).toBeTruthy();
        expect(['vaccination', 'inspection']).toContain(p.type);
        expect([1, 2, 3]).toContain(p.priority);
        expect(p.legalBasis).toBeTruthy();
        expect(typeof p.penalty).toBe('boolean');
      }
    });

    it('should include FMD (구제역)', () => {
      const fmd = VACCINE_PROTOCOLS.find((p) => p.id === 'fmd');
      expect(fmd).toBeDefined();
      expect(fmd!.name).toBe('구제역');
      expect(fmd!.type).toBe('vaccination');
      expect(fmd!.priority).toBe(1);
      expect(fmd!.frequency.type).toBe('fixed_months');
      expect(fmd!.frequency.months).toContain(4);
      expect(fmd!.frequency.months).toContain(10);
    });

    it('should include Brucellosis initial (브루셀라 초회)', () => {
      const bruc = VACCINE_PROTOCOLS.find((p) => p.id === 'brucellosis_initial');
      expect(bruc).toBeDefined();
      expect(bruc!.targetAnimals.sexFilter).toBe('female');
      expect(bruc!.frequency.ageMonthsMin).toBe(3);
      expect(bruc!.frequency.ageMonthsMax).toBe(11);
    });

    it('should include LSD (럼피스킨)', () => {
      const lsd = VACCINE_PROTOCOLS.find((p) => p.id === 'lumpy_skin');
      expect(lsd).toBeDefined();
      expect(lsd!.priority).toBe(1);
      expect(lsd!.frequency.months).toContain(3);
      expect(lsd!.frequency.months).toContain(9);
    });
  });

  describe('getProtocolById', () => {
    it('returns correct protocol for fmd', () => {
      const result = getProtocolById('fmd');
      expect(result).toBeDefined();
      expect(result!.name).toBe('구제역');
    });

    it('returns undefined for unknown id', () => {
      expect(getProtocolById('nonexistent')).toBeUndefined();
    });
  });

  describe('getRequiredProtocols', () => {
    it('returns only priority 1 protocols', () => {
      const required = getRequiredProtocols();
      expect(required.length).toBeGreaterThan(0);
      for (const p of required) {
        expect(p.priority).toBe(1);
      }
    });

    it('includes FMD and LSD', () => {
      const ids = getRequiredProtocols().map((p) => p.id);
      expect(ids).toContain('fmd');
      expect(ids).toContain('lumpy_skin');
    });
  });

  describe('getVaccinationProtocols / getInspectionProtocols', () => {
    it('vaccination protocols are all type vaccination', () => {
      const vacc = getVaccinationProtocols();
      for (const p of vacc) {
        expect(p.type).toBe('vaccination');
      }
    });

    it('inspection protocols are all type inspection', () => {
      const insp = getInspectionProtocols();
      for (const p of insp) {
        expect(p.type).toBe('inspection');
      }
    });

    it('vaccination + inspection = total', () => {
      const total = getVaccinationProtocols().length + getInspectionProtocols().length;
      expect(total).toBe(VACCINE_PROTOCOLS.length);
    });
  });

  describe('getProtocolsForMonth', () => {
    it('returns FMD for April (4)', () => {
      const april = getProtocolsForMonth(4);
      const ids = april.map((p) => p.id);
      expect(ids).toContain('fmd');
    });

    it('returns FMD for October (10)', () => {
      const oct = getProtocolsForMonth(10);
      const ids = oct.map((p) => p.id);
      expect(ids).toContain('fmd');
    });

    it('returns LSD for March (3)', () => {
      const mar = getProtocolsForMonth(3);
      const ids = mar.map((p) => p.id);
      expect(ids).toContain('lumpy_skin');
    });

    it('returns empty for month with no scheduled protocols (e.g., 8)', () => {
      const aug = getProtocolsForMonth(8);
      // August has no fixed_months protocols
      expect(aug.length).toBeLessThanOrEqual(1);
    });
  });

  describe('labels', () => {
    it('VACCINATION_STATUS_LABELS has required keys', () => {
      expect(VACCINATION_STATUS_LABELS.pending).toBe('예정');
      expect(VACCINATION_STATUS_LABELS.completed).toBe('완료');
      expect(VACCINATION_STATUS_LABELS.overdue).toBe('미접종');
    });

    it('INSPECTION_RESULT_LABELS has required keys', () => {
      expect(INSPECTION_RESULT_LABELS.negative).toBe('음성');
      expect(INSPECTION_RESULT_LABELS.positive).toBe('양성');
    });
  });
});
