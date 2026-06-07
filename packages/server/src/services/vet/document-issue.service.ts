// 진료기록 → 공식 문서 모델 빌드 (수의사·농장주 라우트 공용).
// 발행자(issuer)는 '진료를 수행한 수의사'(visit.veterinarianId) + 그 수의사의 면허/병원 마스터.
// 이렇게 하면 농장주가 받은 문서도 동일한 발행자 정보로 렌더된다.
import { getVisitDocumentData, getVetIssuer } from './visit.service.js';
import { getVetProfile } from './vet-profile.service.js';
import { buildVetDocument, type VetDocType, type VetDocModel } from './document-builder.service.js';

export interface BuiltVisitDocument {
  readonly model: VetDocModel;
  readonly farmId: string;
}

export async function buildVisitDocumentModel(
  visitId: string, docType: VetDocType,
): Promise<BuiltVisitDocument | null> {
  const data = await getVisitDocumentData(visitId);
  if (!data) return null;

  const vetId = typeof data.visit.veterinarianId === 'string' ? data.visit.veterinarianId : '';
  const issuer = vetId ? await getVetIssuer(vetId) : null;
  const profile = vetId ? await getVetProfile(vetId) : null;

  const model = buildVetDocument({
    docType,
    visit: data.visit,
    snapshot: data.snapshot,
    issuer: {
      name: issuer?.name ?? '담당 수의사',
      email: issuer?.email ?? null,
      licenseNumber: profile?.licenseNumber ?? null,
      clinicName: profile?.clinicName ?? null,
    },
  });
  return { model, farmId: data.farmId };
}
