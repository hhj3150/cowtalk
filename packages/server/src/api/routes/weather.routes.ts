// 기상 데이터 라우트 — OpenWeatherMap API 연동
// 농장 좌표(lat/lng) 기반 현재 날씨 + THI(열스트레스) 계산

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDb } from '../../config/database.js';
import { farms } from '../../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { config } from '../../config/index.js';
import { calculateTHI } from '../../pipeline/connectors/public-data/weather.connector.js';
import { logger } from '../../lib/logger.js';

export const weatherRouter = Router();

weatherRouter.use(authenticate);

// ── 인메모리 캐시 (10분 TTL) ──

interface WeatherData {
  readonly farmId: string;
  readonly farmName: string;
  readonly temperature: number;
  readonly humidity: number;
  readonly thi: number;
  readonly windSpeed: number;
  readonly precipitation: number;
  readonly description: string;
  readonly icon: string;
  readonly heatStressLevel: 'normal' | 'mild' | 'moderate' | 'severe' | 'emergency';
  readonly coldStressLevel: 'normal' | 'caution' | 'danger';
  readonly fetchedAt: string;
}

interface CacheEntry {
  readonly data: WeatherData;
  readonly expiry: number;
}

const weatherCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분

function getCached(farmId: string): WeatherData | null {
  const entry = weatherCache.get(farmId);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    weatherCache.delete(farmId);
    return null;
  }
  return entry.data;
}

function setCache(farmId: string, data: WeatherData): void {
  weatherCache.set(farmId, { data, expiry: Date.now() + CACHE_TTL_MS });
}

// ── THI → 열스트레스 등급 ──

function getHeatStressLevel(thi: number): WeatherData['heatStressLevel'] {
  if (thi >= 84) return 'emergency';   // 긴급 — 유량 25%↓, 폐사 위험
  if (thi >= 78) return 'severe';      // 심각 — 유량 15%↓
  if (thi >= 72) return 'moderate';    // 주의 — 유량 5%↓
  if (thi >= 68) return 'mild';        // 경미 — 모니터링
  return 'normal';
}

function getColdStressLevel(temp: number): WeatherData['coldStressLevel'] {
  if (temp <= -15) return 'danger';    // 한파 — 동상/동사 위험
  if (temp <= -5) return 'caution';    // 주의 — 음수 결빙
  return 'normal';
}

// ── OpenWeatherMap API 호출 ──

async function fetchWeatherFromAPI(
  lat: number,
  lng: number,
  farmId: string,
  farmName: string,
): Promise<WeatherData> {
  const apiKey = config.OPENWEATHER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENWEATHER_API_KEY not configured');
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${String(lat)}&lon=${String(lng)}&appid=${apiKey}&units=metric&lang=kr`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OpenWeatherMap API error: ${String(response.status)}`);
  }

  const json = await response.json() as {
    main: { temp: number; humidity: number };
    wind: { speed: number };
    rain?: { '1h'?: number };
    weather: { description: string; icon: string }[];
  };

  const temp = json.main.temp;
  const humidity = json.main.humidity;
  const thi = Math.round(calculateTHI(temp, humidity) * 10) / 10;

  return {
    farmId,
    farmName,
    temperature: Math.round(temp * 10) / 10,
    humidity,
    thi,
    windSpeed: Math.round((json.wind.speed ?? 0) * 10) / 10,
    precipitation: json.rain?.['1h'] ?? 0,
    description: json.weather[0]?.description ?? '',
    icon: json.weather[0]?.icon ?? '01d',
    heatStressLevel: getHeatStressLevel(thi),
    coldStressLevel: getColdStressLevel(temp),
    fetchedAt: new Date().toISOString(),
  };
}

// GET /api/weather/farm/:farmId — 단일 농장 기상

weatherRouter.get('/farm/:farmId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string;

    // 캐시 확인
    const cached = getCached(farmId);
    if (cached) {
      res.json({ success: true, data: cached, cached: true });
      return;
    }

    const db = getDb();
    const [farm] = await db
      .select({ farmId: farms.farmId, name: farms.name, lat: farms.lat, lng: farms.lng })
      .from(farms)
      .where(eq(farms.farmId, farmId));

    if (!farm) {
      res.status(404).json({ success: false, error: '농장을 찾을 수 없습니다' });
      return;
    }

    const data = await fetchWeatherFromAPI(farm.lat, farm.lng, farm.farmId, farm.name);
    setCache(farmId, data);

    res.json({ success: true, data, cached: false });
  } catch (error) {
    if ((error as Error).message?.includes('OPENWEATHER_API_KEY')) {
      res.status(503).json({ success: false, error: '기상 API 키가 설정되지 않았습니다' });
      return;
    }
    logger.error({ error }, 'Weather API failed');
    next(error);
  }
});

// GET /api/weather/farms?farmIds=id1,id2,... — 다중 농장 일괄 기상

weatherRouter.get('/farms', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmIdsParam = req.query.farmIds as string | undefined;
    if (!farmIdsParam) {
      res.status(400).json({ success: false, error: 'farmIds 파라미터가 필요합니다' });
      return;
    }

    const farmIds = farmIdsParam.split(',').filter(Boolean).slice(0, 20); // 최대 20개

    // 캐시된 것과 미캐시된 것 분리
    const results: WeatherData[] = [];
    const uncachedIds: string[] = [];

    for (const fid of farmIds) {
      const cached = getCached(fid);
      if (cached) {
        results.push(cached);
      } else {
        uncachedIds.push(fid);
      }
    }

    // 미캐시된 농장 좌표 조회 + API 호출
    if (uncachedIds.length > 0) {
      const db = getDb();
      const farmList = await db
        .select({ farmId: farms.farmId, name: farms.name, lat: farms.lat, lng: farms.lng })
        .from(farms)
        .where(inArray(farms.farmId, uncachedIds));

      // 순차 호출 (rate limit 존재)
      for (const farm of farmList) {
        try {
          const data = await fetchWeatherFromAPI(farm.lat, farm.lng, farm.farmId, farm.name);
          setCache(farm.farmId, data);
          results.push(data);
        } catch (err) {
          logger.warn({ farmId: farm.farmId, err }, 'Weather fetch failed for farm');
        }
      }
    }

    res.json({ success: true, data: results, total: results.length });
  } catch (error) {
    logger.error({ error }, 'Batch weather API failed');
    next(error);
  }
});
