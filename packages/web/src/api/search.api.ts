// 통합 검색 API — 이력번호, 이표번호, 농장명

import { apiGet } from './client';

export interface SearchResult {
  readonly type: 'animal' | 'farm';
  readonly id: string;
  readonly label: string;
  readonly subLabel: string | null;
  readonly traceId: string | null;
  readonly earTag: string | null;
  readonly farmName: string | null;
}

export interface SearchResponse {
  readonly results: readonly SearchResult[];
  readonly total: number;
}

export function search(query: string): Promise<SearchResponse> {
  return apiGet<SearchResponse>('/search', { q: query });
}

export function searchAutocomplete(query: string): Promise<readonly SearchResult[]> {
  return apiGet<readonly SearchResult[]>('/search/autocomplete', { q: query });
}
