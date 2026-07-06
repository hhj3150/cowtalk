// 지오코딩 라우트 — 주소 → 좌표 변환 (목장 정보 창의 "주소로 좌표 찾기")
// 1순위: Kakao Local API (KAKAO_REST_API_KEY 설정 시) — 한국 지번·도로명 필지 정밀도
// 2순위: OpenStreetMap Nominatim — 키 불필요, 해외 주소(예: 필리핀 물소센터) 지원

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';

export const geoRouter = Router();

geoRouter.use(authenticate);

export interface GeocodeResult {
  readonly label: string;
  readonly lat: number;
  readonly lng: number;
  readonly provider: 'kakao' | 'nominatim';
}

const FETCH_TIMEOUT_MS = 8000;

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`geocoder ${String(res.status)}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeKakao(query: string): Promise<GeocodeResult[]> {
  const key = config.KAKAO_REST_API_KEY;
  if (!key) return [];
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}&size=5`;
  const data = (await fetchJson(url, { Authorization: `KakaoAK ${key}` })) as {
    documents?: ReadonlyArray<{ address_name: string; y: string; x: string }>;
  };
  return (data.documents ?? []).map((d) => ({
    label: d.address_name,
    lat: Number(d.y),
    lng: Number(d.x),
    provider: 'kakao' as const,
  }));
}

async function geocodeNominatim(query: string): Promise<GeocodeResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=ko`;
  const data = (await fetchJson(url, {
    'User-Agent': 'CowTalk/5.0 (livestock platform; geocoding for farm registry)',
  })) as ReadonlyArray<{ display_name: string; lat: string; lon: string }>;
  return data.map((d) => ({
    label: d.display_name,
    lat: Number(d.lat),
    lng: Number(d.lon),
    provider: 'nominatim' as const,
  }));
}

// GET /geo/geocode?query=경기도 안성시 미양면 갈전리 286-8
geoRouter.get('/geocode', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
    if (query.length < 3) {
      res.status(400).json({ success: false, error: { code: 'INVALID_QUERY', message: '주소를 3자 이상 입력하세요' } });
      return;
    }

    // Kakao 우선 (한국 지번 정밀) → 결과 없거나 실패 시 Nominatim
    let results: GeocodeResult[] = [];
    try {
      results = await geocodeKakao(query);
    } catch (err) {
      logger.warn({ err }, '[Geo] Kakao 지오코딩 실패 — Nominatim으로 폴백');
    }
    if (results.length === 0) {
      try {
        results = await geocodeNominatim(query);
      } catch (err) {
        logger.warn({ err }, '[Geo] Nominatim 지오코딩 실패');
      }
    }

    res.json({ success: true, data: { query, results } });
  } catch (error) {
    next(error);
  }
});
