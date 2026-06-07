// 공식 문서 모델 빌더 — buildVetDocument 순수 함수 단위 테스트 (4단계)
// DB·pdfkit 불필요. 누락 데이터 안전 처리 + 문서 유형별 섹션 검증.

import { describe, it, expect } from 'vitest';
import { buildVetDocument, VET_DOC_TITLES } from '../document-builder.service.js';

const visit = {
  visitDatetime: '2026-06-01T02:00:00.000Z',
  chiefComplaint: '식욕저하',
  finalDiagnosis: '산후 자궁염',
  treatment: '항생제 투여',
  prescription: '옥시테트라사이클린 10ml',
  medication: 'OTC 3일',
  withdrawalPeriod: '도축 28일 / 우유 5일',
  prognosis: '양호',
  quarantineRequired: false,
  farmerInstruction: '3일 후 재진',
};
const snapshot = {
  farmSnapshotJson: { farm_name: '해돋이목장', owner_name: '홍길동', address: '포천시' },
  animalSnapshotJson: { ear_tag_number: '423', trace_id: '002132665191', breed: '홀스타인', sex: 'F', parity: 3 },
};
const issuer = { name: '김수의', email: 'vet@example.com' };

describe('buildVetDocument — 공식 문서 모델', () => {
  it('진료기록부: 제목 + 식별 헤더 + 전체 섹션 포함', () => {
    const m = buildVetDocument({ docType: 'medical_record', visit, snapshot, issuer });
    expect(m.doc_title).toBe(VET_DOC_TITLES.medical_record);
    expect(m.header_pairs.find((p) => p.key === '이력제번호')?.value).toBe('002132665191');
    expect(m.header_pairs.find((p) => p.key === '관리번호(이표)')?.value).toBe('423');
    const headings = m.sections.map((s) => s.heading);
    expect(headings).toContain('진단 및 처치');
    const dx = m.sections.flatMap((s) => s.pairs ?? []).find((p) => p.key === '최종 진단');
    expect(dx?.value).toBe('산후 자궁염');
  });

  it('처방전: 휴약기간을 강조 섹션으로 노출', () => {
    const m = buildVetDocument({ docType: 'prescription', visit, snapshot, issuer });
    expect(m.doc_title).toBe('처방전');
    const wd = m.sections.find((s) => s.heading.includes('휴약기간'));
    expect(wd?.paragraphs?.[0]).toBe('도축 28일 / 우유 5일');
  });

  it('진단서: 진단명 + 증명 문구 포함', () => {
    const m = buildVetDocument({ docType: 'diagnosis', visit, snapshot, issuer });
    expect(m.sections.find((s) => s.heading === '진단명')?.paragraphs?.[0]).toBe('산후 자궁염');
    expect(m.sections.some((s) => (s.paragraphs ?? []).some((t) => t.includes('증명')))).toBe(true);
  });

  it('snapshot/필드 누락 시 대시(—)로 안전 처리하고 크래시 없음', () => {
    const m = buildVetDocument({ docType: 'diagnosis', visit: {}, snapshot: null, issuer: { name: '담당 수의사' } });
    expect(m.header_pairs.find((p) => p.key === '농장명')?.value).toBe('—');
    expect(m.issuer.name).toBe('담당 수의사');
    expect(m.issuer.licenseNumber).toBeNull();
  });

  it('휴약기간 미입력 시 처방전에 "해당 없음" 표기', () => {
    const m = buildVetDocument({ docType: 'prescription', visit: { finalDiagnosis: 'x' }, snapshot, issuer });
    const wd = m.sections.find((s) => s.heading.includes('휴약기간'));
    expect(wd?.paragraphs?.[0]).toBe('해당 없음');
  });

  it('발행일 기본값은 오늘(YYYY-MM-DD), 지정 시 그 값', () => {
    const m1 = buildVetDocument({ docType: 'diagnosis', visit, snapshot, issuer });
    expect(m1.issue_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const m2 = buildVetDocument({ docType: 'diagnosis', visit, snapshot, issuer, issueDate: '2026-06-07' });
    expect(m2.issue_date).toBe('2026-06-07');
  });
});
