// 농장주 수신함 API — 수의사가 보낸 공식 문서 열람·확인
import { apiGet, apiPost, apiClient } from './client';
import type { VetDocModel, VetDocType } from './vet.api';

export interface FarmerDocument {
  delivery_id: string;
  doc_type: VetDocType;
  doc_title: string;
  note: string | null;
  status: string; // sent | acknowledged
  sent_at: string;
  visit_id: string;
  ear_tag_number: string | null;
  final_diagnosis: string | null;
  visit_datetime: string;
}

export const farmerApi = {
  listDocuments: () => apiGet<FarmerDocument[]>('/farmer/documents'),
  getDocument: (deliveryId: string) => apiGet<VetDocModel>(`/farmer/documents/${deliveryId}`),
  acknowledge: (deliveryId: string) =>
    apiPost<{ deliveryId: string; status: string }>(`/farmer/documents/${deliveryId}/acknowledge`),
  downloadPdf: async (deliveryId: string): Promise<Blob> => {
    const res = await apiClient.get<Blob>(`/farmer/documents/${deliveryId}/pdf`, { responseType: 'blob' });
    return res.data;
  },
};
