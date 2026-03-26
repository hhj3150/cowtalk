// 이표 스캔 API — 카메라 촬영 → Claude Vision OCR → 개체 조회

import { apiPost } from './client';

export interface AnimalScanResult {
  readonly animalId: string;
  readonly earTag: string;
  readonly traceId: string | null;
  readonly name: string | null;
  readonly farmName: string | null;
  readonly status: string;
  readonly breed: string | null;
  readonly birthDate: string | null;
  readonly lactationStatus: string | null;
}

export interface EarTagScanResponse {
  readonly recognized: readonly string[];
  readonly confidence: 'high' | 'medium' | 'low' | 'manual';
  readonly animal: AnimalScanResult | null;
  readonly candidates: readonly AnimalScanResult[];
  readonly message: string;
}

/** 이미지 → base64 변환 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data:image/jpeg;base64,XXXXX → XXXXX 부분만 추출
      const base64 = result.split(',')[1] ?? '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
  });
}

/** 카메라 촬영 이미지 → Claude Vision → 개체 조회 */
export function scanEarTag(
  imageBase64: string,
  mimeType: string,
): Promise<EarTagScanResponse> {
  return apiPost<EarTagScanResponse>('/ear-tag-scan', {
    image: imageBase64,
    mimeType,
  });
}

/** 수동 번호 입력 → 개체 조회 */
export function scanEarTagManual(number: string): Promise<EarTagScanResponse> {
  return apiPost<EarTagScanResponse>('/ear-tag-scan/manual', { number });
}
