// 축산 뉴스 API 클라이언트

import { apiGet } from './client';

export type NewsCategory = 'policy' | 'latest' | 'global' | 'disease' | 'notice';

export interface NewsItem {
  readonly title: string;
  readonly source: string;
  readonly date: string;
  readonly url: string;
  readonly category: NewsCategory;
  readonly pubDate: string;
}

export function fetchNews(): Promise<readonly NewsItem[]> {
  return apiGet<readonly NewsItem[]>('/news');
}
