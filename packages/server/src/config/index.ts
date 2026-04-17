// 중앙 설정 — 환경변수 → 타입 객체

import { z } from 'zod';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 모노레포 루트 .env 로드 (packages/server/src/config/ → 4단계 상위)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(__dirname, '../../../../.env');

// override: true → 환경에 빈 문자열로 존재해도 .env 값 우선
dotenv.config({ path: rootEnvPath, override: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('cowtalk'),
  DB_USER: z.string().default('cowtalk'),
  DB_PASSWORD: z.string().default('cowtalk_dev_2025'),

  REDIS_ENABLED: z.coerce.boolean().default(true),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().default(''),

  JWT_ACCESS_SECRET: z.string().default('dev-access-secret-change-in-production'),
  JWT_REFRESH_SECRET: z.string().default('dev-refresh-secret-change-in-production'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('2h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  LOG_LEVEL: z.string().default('debug'),

  // smaXtec API
  SMAXTEC_EMAIL: z.string().optional(),
  SMAXTEC_PASSWORD: z.string().optional(),

  // 공공데이터 API
  PUBLIC_DATA_API_KEY: z.string().optional(),

  // Anthropic Claude API — 이중 모델 구성
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-5-20250929'),
  ANTHROPIC_MODEL_DEEP: z.string().default('claude-opus-4-5-20251101'),
  ANTHROPIC_MAX_TOKENS_ANALYSIS: z.coerce.number().default(4000),
  ANTHROPIC_MAX_TOKENS_CHAT: z.coerce.number().default(4000),

  // OpenWeatherMap API
  OPENWEATHER_API_KEY: z.string().optional(),

  // OpenAI TTS (음성 합성) — 팅커벨 음성 답변
  // 키 발급: platform.openai.com → API keys (Audio 권한만 부여 권장)
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_TTS_MODEL: z.enum(['tts-1', 'tts-1-hd']).default('tts-1'),
  OPENAI_TTS_VOICE: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).default('nova'),
  OPENAI_TTS_MAX_CHARS: z.coerce.number().int().min(50).max(4000).default(500), // 비용 절감 — 응답 앞 500자만 합성
  OPENAI_TTS_FORMAT: z.enum(['mp3', 'opus', 'aac', 'flac']).default('mp3'),

  // Web Push (VAPID)
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_EMAIL: z.string().default('mailto:ha@d2o.kr'),

  // 카카오 알림톡 (Solapi)
  // 카카오채널 등록 후 https://console.solapi.com에서 발급
  KAKAO_ALIMTALK_API_KEY: z.string().optional(),
  KAKAO_ALIMTALK_API_SECRET: z.string().optional(),
  KAKAO_ALIMTALK_PFID: z.string().optional(),       // 카카오 플러스친구 채널 ID
  KAKAO_ALIMTALK_FROM: z.string().optional(),        // 발신번호 (Solapi 등록 번호)
  KAKAO_ALIMTALK_TEST_MODE: z.coerce.boolean().default(true), // true=로그만, false=실발송

  // 토스페이먼츠 구독 결제
  // https://console.tosspayments.com 에서 발급
  TOSS_PAYMENTS_SECRET_KEY: z.string().optional(),   // sk_test_... 또는 sk_live_...
  TOSS_PAYMENTS_CLIENT_KEY: z.string().optional(),   // ck_test_... 또는 ck_live_...
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const config = parsed.data;

export function getDatabaseUrl(): string {
  return `postgresql://${config.DB_USER}:${config.DB_PASSWORD}@${config.DB_HOST}:${String(config.DB_PORT)}/${config.DB_NAME}`;
}
