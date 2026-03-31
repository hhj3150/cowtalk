// 축산 뉴스 RSS 수집 서비스 — 한국 축산 관련 뉴스 피드 자동 수집
// 30분 캐시 TTL, 장애 시 정적 폴백 데이터 반환

import { XMLParser } from 'fast-xml-parser';
import { logger } from '../lib/logger.js';

// ── 뉴스 아이템 타입 ──

export type NewsCategory = 'policy' | 'latest' | 'global' | 'disease' | 'notice';

export interface NewsItem {
  readonly title: string;
  readonly source: string;
  readonly date: string;
  readonly url: string;
  readonly category: NewsCategory;
  readonly pubDate: string;   // ISO 8601
}

// ── RSS 피드 설정 ──

interface FeedSource {
  readonly name: string;
  readonly url: string;
  readonly category: NewsCategory;
  readonly source: string;
}

const FEED_SOURCES: readonly FeedSource[] = [
  {
    name: '축산신문',
    url: 'https://www.chuksannews.co.kr/rss/S1N2.xml',
    category: 'latest',
    source: '축산신문',
  },
  {
    name: '농민신문-축산',
    url: 'https://www.nongmin.com/rss/livestock.xml',
    category: 'latest',
    source: '농민신문',
  },
  {
    name: '축산경제신문',
    url: 'https://www.livestockeconomy.co.kr/rss/allArticle.xml',
    category: 'latest',
    source: '축산경제',
  },
];

// ── 캐시 ──

const CACHE_TTL_MS = 30 * 60 * 1000; // 30분

interface NewsCache {
  readonly items: readonly NewsItem[];
  readonly fetchedAt: number;
}

let cache: NewsCache | null = null;

// ── XML 파서 ──

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
});

// ── 카테고리 키워드 자동 분류 ──

const CATEGORY_KEYWORDS: ReadonlyArray<{ keywords: readonly string[]; category: NewsCategory }> = [
  { keywords: ['구제역', '조류독감', 'AI 발생', '살처분', '방역', '검역', '전염병', '럼피스킨', '브루셀라', '결핵', 'KAHIS'], category: 'disease' },
  { keywords: ['정책', '직불금', '지원금', '규제', '법안', '시행', '농식품부', '개정', '예산'], category: 'policy' },
  { keywords: ['해외', '수출', '수입', 'EU', 'OIE', 'USDA', '호주', '미국', '일본', '중국'], category: 'global' },
  { keywords: ['공지', '안내', '모집', '교육', '세미나'], category: 'notice' },
];

function classifyCategory(title: string, defaultCategory: NewsCategory): NewsCategory {
  for (const rule of CATEGORY_KEYWORDS) {
    if (rule.keywords.some((kw) => title.includes(kw))) {
      return rule.category;
    }
  }
  return defaultCategory;
}

// ── 날짜 포맷 ──

function formatShortDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${d.getMonth() + 1}.${d.getDate()}`;
  } catch {
    return '';
  }
}

// ── RSS 파싱 ──

interface RssItem {
  readonly title?: string;
  readonly link?: string;
  readonly pubDate?: string;
  readonly description?: string;
  readonly 'dc:date'?: string;
}

function parseRssItems(xml: string): readonly RssItem[] {
  try {
    const parsed = xmlParser.parse(xml);
    // RSS 2.0: rss.channel.item
    const channel = parsed?.rss?.channel;
    if (channel?.item) {
      const items = Array.isArray(channel.item) ? channel.item : [channel.item];
      return items;
    }
    // Atom: feed.entry
    const entries = parsed?.feed?.entry;
    if (entries) {
      const items = Array.isArray(entries) ? entries : [entries];
      return items.map((e: Record<string, unknown>) => ({
        title: typeof e.title === 'object' ? (e.title as Record<string, string>)?.['#text'] : e.title as string,
        link: typeof e.link === 'object' ? (e.link as Record<string, string>)?.['@_href'] : e.link as string,
        pubDate: (e.published ?? e.updated) as string,
      }));
    }
    return [];
  } catch (err) {
    logger.warn({ err }, '[News] RSS parse error');
    return [];
  }
}

async function fetchFeed(feed: FeedSource): Promise<readonly NewsItem[]> {
  try {
    const res = await fetch(feed.url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'CowTalk/5.0 (Livestock News Aggregator)' },
    });

    if (!res.ok) {
      logger.warn({ status: res.status, feed: feed.name }, '[News] RSS fetch non-OK');
      return [];
    }

    const xml = await res.text();
    const items = parseRssItems(xml);

    return items
      .filter((item) => item.title && item.link)
      .slice(0, 10)
      .map((item) => {
        const title = (item.title ?? '').trim();
        const dateRaw = item.pubDate ?? item['dc:date'] ?? '';
        return {
          title,
          source: feed.source,
          date: formatShortDate(dateRaw),
          url: (item.link ?? '#').trim(),
          category: classifyCategory(title, feed.category),
          pubDate: dateRaw ? new Date(dateRaw).toISOString() : new Date().toISOString(),
        };
      });
  } catch (err) {
    logger.warn({ err, feed: feed.name }, '[News] RSS fetch error');
    return [];
  }
}

// ── 정적 폴백 데이터 ──

const FALLBACK_NEWS: readonly NewsItem[] = [
  { title: '럼피스킨병 백신 접종률 98% 달성', source: '농림축산식품부', date: '3.28', url: '#', category: 'disease', pubDate: '2026-03-28T00:00:00Z' },
  { title: '2026년 축산 직불금 확대 시행', source: '농림축산식품부', date: '3.28', url: '#', category: 'policy', pubDate: '2026-03-28T00:00:00Z' },
  { title: '올해 한우 송아지 가격 전년 대비 12% 상승', source: '축산신문', date: '3.27', url: '#', category: 'latest', pubDate: '2026-03-27T00:00:00Z' },
  { title: 'EU, 항생제 사용 50% 감축 로드맵 발표', source: 'EMA', date: '3.27', url: '#', category: 'global', pubDate: '2026-03-27T00:00:00Z' },
  { title: '젖소 유량 신기록 — 홀스타인 평균 35L 돌파', source: 'DCIC', date: '3.26', url: '#', category: 'latest', pubDate: '2026-03-26T00:00:00Z' },
  { title: '호주 구제역 의심 사례 발생 — 한국 수입 검역 강화', source: 'OIE', date: '3.26', url: '#', category: 'disease', pubDate: '2026-03-26T00:00:00Z' },
  { title: 'AI 센서 기반 질병 조기감지 시스템 확산', source: '농촌진흥청', date: '3.25', url: '#', category: 'latest', pubDate: '2026-03-25T00:00:00Z' },
  { title: '구제역 청정국 지위 3년 연속 유지', source: 'OIE', date: '3.24', url: '#', category: 'global', pubDate: '2026-03-24T00:00:00Z' },
  { title: '축산 환경규제 강화 — 2027년까지 적용', source: '환경부', date: '3.23', url: '#', category: 'policy', pubDate: '2026-03-23T00:00:00Z' },
  { title: 'CowTalk v5.0 업데이트 — 번식 AI 루프 추가', source: 'D2O Corp', date: '3.23', url: '#', category: 'notice', pubDate: '2026-03-23T00:00:00Z' },
];

// ── 공개 API ──

export async function getLatestNews(): Promise<readonly NewsItem[]> {
  // 캐시 유효 → 즉시 반환
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.items;
  }

  // 모든 피드 병렬 수집
  const results = await Promise.allSettled(FEED_SOURCES.map(fetchFeed));
  const allItems: NewsItem[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allItems.push(...result.value);
    }
  }

  // 날짜순 정렬 (최신 먼저)
  allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  // 중복 제거 (같은 제목)
  const seen = new Set<string>();
  const unique = allItems.filter((item) => {
    const key = item.title.slice(0, 30);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const finalItems = unique.slice(0, 20);

  // 수집 결과가 있으면 캐시, 없으면 폴백
  if (finalItems.length > 0) {
    cache = { items: finalItems, fetchedAt: Date.now() };
    logger.info({ count: finalItems.length }, '[News] RSS fetch complete');
    return finalItems;
  }

  logger.warn('[News] No RSS items fetched — returning fallback');
  return FALLBACK_NEWS;
}

// 캐시 강제 갱신
export async function refreshNewsCache(): Promise<readonly NewsItem[]> {
  cache = null;
  return getLatestNews();
}
