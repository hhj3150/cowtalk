// 내보내기 API — CSV/Excel

import { apiClient } from './client';

export type ExportFormat = 'csv' | 'excel';
export type ExportTarget = 'animals' | 'alerts' | 'sensors' | 'predictions' | 'farms' | 'regional';

export async function downloadExport(
  target: ExportTarget,
  format: ExportFormat,
  params?: Record<string, unknown>,
): Promise<void> {
  const response = await apiClient.get(`/export/${target}`, {
    params: { format, ...params },
    responseType: 'blob',
  });

  const extension = format === 'csv' ? 'csv' : 'xlsx';
  const filename = `cowtalk_${target}_${new Date().toISOString().slice(0, 10)}.${extension}`;

  const url = window.URL.createObjectURL(new Blob([response.data as BlobPart]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
