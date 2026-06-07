// 수의사 진료센터 — 4단계 공식 문서 모델 빌더 (순수 함수, DB 불필요)
// 저장된 진료기록 + 동결 snapshot + 발행자(수의사) → 문서 모델.
// 모델은 PDF 렌더러(document-pdf.service)와 웹 미리보기가 공유한다.

export const VET_DOC_TYPES = ['medical_record', 'prescription', 'diagnosis', 'necropsy', 'vaccination'] as const;
export type VetDocType = (typeof VET_DOC_TYPES)[number];

export const VET_DOC_TITLES: Record<VetDocType, string> = {
  medical_record: '진료기록부',
  prescription: '처방전',
  diagnosis: '진단서',
  necropsy: '검안서',
  vaccination: '예방접종증명서',
};

export interface DocPair {
  readonly key: string;
  readonly value: string;
}

export interface DocSection {
  readonly heading: string;
  readonly pairs?: ReadonlyArray<DocPair>;
  readonly paragraphs?: ReadonlyArray<string>;
}

export interface VetDocIssuer {
  readonly name: string;        // 발행 수의사 성명
  readonly email?: string | null;
  readonly licenseNumber?: string | null; // 면허번호 (미보유 시 수기 기입란)
  readonly clinicName?: string | null;
}

export interface VetDocModel {
  readonly doc_type: VetDocType;
  readonly doc_title: string;
  readonly issue_date: string;       // YYYY-MM-DD
  readonly header_pairs: ReadonlyArray<DocPair>; // 농장·개체 식별
  readonly sections: ReadonlyArray<DocSection>;
  readonly issuer: VetDocIssuer;
  readonly footer_notes: ReadonlyArray<string>;
}

// 문자열 안전화 — null/undefined/비문자 → 빈칸 또는 대시
function s(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? '예' : '아니오';
  return String(v);
}
function dash(v: unknown): string {
  const t = s(v).trim();
  return t.length > 0 ? t : '—';
}
function ymd(v: unknown): string {
  const t = s(v).trim();
  if (!t) return '';
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? t : d.toISOString().slice(0, 10);
}

// 개체·농장 식별 헤더 (3개 문서 공통)
function buildHeaderPairs(
  visit: Record<string, unknown>,
  farm: Record<string, unknown>,
  animal: Record<string, unknown>,
): DocPair[] {
  return [
    { key: '농장명', value: dash(farm.farm_name) },
    { key: '농장주', value: dash(farm.owner_name) },
    { key: '소재지', value: dash(farm.address) },
    { key: '이력제번호', value: dash(animal.trace_id) },
    { key: '관리번호(이표)', value: dash(animal.ear_tag_number) },
    { key: '품종/성별', value: `${dash(animal.breed)} / ${dash(animal.sex)}` },
    { key: '산차', value: dash(animal.parity) },
    { key: '진료일시', value: ymd(visit.visitDatetime) || dash(visit.visitDatetime) },
  ];
}

// 발행 목적/유효 필드 정리
function withdrawalLine(visit: Record<string, unknown>): string {
  const w = s(visit.withdrawalPeriod).trim();
  return w.length > 0 ? w : '해당 없음';
}

export interface BuildVetDocumentInput {
  readonly docType: VetDocType;
  readonly visit: Record<string, unknown>;          // veterinary_visits 행 (camelCase)
  readonly snapshot: Record<string, unknown> | null; // veterinary_visit_snapshots 행 (camelCase)
  readonly issuer: VetDocIssuer;
  readonly issueDate?: string;                        // 기본: 오늘
}

export function buildVetDocument(input: BuildVetDocumentInput): VetDocModel {
  const { docType, visit, issuer } = input;
  const snap = input.snapshot ?? {};
  const farm = (snap.farmSnapshotJson as Record<string, unknown> | undefined) ?? {};
  const animal = (snap.animalSnapshotJson as Record<string, unknown> | undefined) ?? {};
  const issueDate = (input.issueDate ?? new Date().toISOString().slice(0, 10));

  const headerPairs = buildHeaderPairs(visit, farm, animal);

  const commonFooter = [
    '본 문서는 CowTalk 진료센터에서 진료 시점 동결 데이터를 기반으로 발행되었습니다.',
    '면허번호·서명란은 발행 수의사 본인이 최종 확인·서명합니다.',
  ];

  let sections: DocSection[];

  if (docType === 'medical_record') {
    // 진료기록부 — 전체 진료 내용
    sections = [
      {
        heading: '진료 경과',
        pairs: [
          { key: '내원 사유', value: dash(visit.visitReason) },
          { key: '주증상', value: dash(visit.chiefComplaint) },
          { key: '농장주 진술', value: dash(visit.farmerStatement) },
        ],
      },
      {
        heading: '검사 소견',
        pairs: [
          { key: '신체검사', value: dash(visit.physicalExam) },
          { key: '임상 소견', value: dash(visit.clinicalFindings) },
          { key: '감별진단', value: dash(visit.differentialDiagnosis) },
        ],
      },
      {
        heading: '진단 및 처치',
        pairs: [
          { key: '최종 진단', value: dash(visit.finalDiagnosis) },
          { key: '처치', value: dash(visit.treatment) },
          { key: '처방·투약', value: dash(visit.prescription) },
          { key: '투약 상세', value: dash(visit.medication) },
          { key: '휴약기간', value: withdrawalLine(visit) },
          { key: '예후', value: dash(visit.prognosis) },
          { key: '재진 예정일', value: ymd(visit.followUpDate) || '—' },
          { key: '방역 조치 필요', value: visit.quarantineRequired ? '예' : '아니오' },
        ],
      },
      {
        heading: '농장주 안내',
        paragraphs: [dash(visit.farmerInstruction)],
      },
    ];
  } else if (docType === 'prescription') {
    // 처방전 — 처방·투약·휴약 중심
    sections = [
      {
        heading: '처방 사유 (진단)',
        paragraphs: [dash(visit.finalDiagnosis)],
      },
      {
        heading: '처방 내용',
        pairs: [
          { key: '처방·투약', value: dash(visit.prescription) },
          { key: '투약 상세', value: dash(visit.medication) },
          { key: '처치', value: dash(visit.treatment) },
        ],
      },
      {
        heading: '⚠ 휴약기간 (출하·식용 제한)',
        paragraphs: [withdrawalLine(visit)],
      },
      {
        heading: '농장주 지시사항',
        paragraphs: [dash(visit.farmerInstruction)],
      },
    ];
  } else if (docType === 'diagnosis') {
    // 진단서
    sections = [
      {
        heading: '진단명',
        paragraphs: [dash(visit.finalDiagnosis)],
      },
      {
        heading: '임상 소견',
        pairs: [
          { key: '주증상', value: dash(visit.chiefComplaint) },
          { key: '신체검사', value: dash(visit.physicalExam) },
          { key: '임상 소견', value: dash(visit.clinicalFindings) },
        ],
      },
      {
        heading: '예후 및 향후 조치',
        pairs: [
          { key: '예후', value: dash(visit.prognosis) },
          { key: '휴약기간', value: withdrawalLine(visit) },
          { key: '방역 조치 필요', value: visit.quarantineRequired ? '예' : '아니오' },
        ],
      },
      {
        heading: '용도',
        paragraphs: ['상기 개체는 위와 같이 진단되었음을 증명합니다.'],
      },
    ];
  } else if (docType === 'necropsy') {
    // 검안서 (사체 검안)
    sections = [
      {
        heading: '검안 개요',
        pairs: [
          { key: '검안 사유', value: dash(visit.visitReason) },
          { key: '의뢰자 진술', value: dash(visit.farmerStatement) },
        ],
      },
      {
        heading: '검안 소견',
        pairs: [
          { key: '외관·신체검사', value: dash(visit.physicalExam) },
          { key: '검안 소견', value: dash(visit.clinicalFindings) },
        ],
      },
      {
        heading: '추정 사인',
        paragraphs: [dash(visit.finalDiagnosis)],
      },
      {
        heading: '비고',
        paragraphs: [dash(visit.veterinarianNotes)],
      },
      {
        heading: '용도',
        paragraphs: ['상기 개체를 검안한 결과는 위와 같음을 증명합니다.'],
      },
    ];
  } else if (docType === 'vaccination') {
    // 예방접종증명서 (접종 내역은 진료기록의 처치·투약 기준)
    sections = [
      {
        heading: '접종 내역',
        pairs: [
          { key: '백신·처치', value: dash(visit.treatment) },
          { key: '접종 상세', value: dash(visit.medication) },
          { key: '처방', value: dash(visit.prescription) },
        ],
      },
      {
        heading: '접종 후 주의사항',
        paragraphs: [dash(visit.farmerInstruction)],
      },
      {
        heading: '용도',
        paragraphs: ['상기 개체에 대하여 위와 같이 예방접종을 실시하였음을 증명합니다.'],
      },
    ];
  } else {
    sections = [];
  }

  return {
    doc_type: docType,
    doc_title: VET_DOC_TITLES[docType],
    issue_date: issueDate,
    header_pairs: headerPairs,
    sections,
    issuer: {
      name: issuer.name,
      email: issuer.email ?? null,
      licenseNumber: issuer.licenseNumber ?? null,
      clinicName: issuer.clinicName ?? null,
    },
    footer_notes: commonFooter,
  };
}
