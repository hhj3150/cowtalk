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
  // 채팅 온도 — 임상·번식·방역 답변은 정확도 > 창의성 (0.4 권장)
  // 도구 결과 종합용 final wrap-up 라운드는 더 낮춤 (0.3)
  ANTHROPIC_TEMPERATURE_CHAT: z.coerce.number().min(0).max(1).default(0.4),
  ANTHROPIC_TEMPERATURE_CHAT_FINAL: z.coerce.number().min(0).max(1).default(0.3),
  // Extended Thinking — 감별진단·번식 추천 같은 복잡 질문에 활성화 (budget=0 비활성)
  // 1024~16000 토큰 권장. 비용 추가되므로 휴리스틱으로 일부 케이스만.
  ANTHROPIC_THINKING_BUDGET: z.coerce.number().int().min(0).max(16000).default(2048),

  // OpenWeatherMap API
  OPENWEATHER_API_KEY: z.string().optional(),

  // OpenAI TTS (음성 합성) — 팅커벨 음성 답변
  // 키 발급: platform.openai.com → API keys (Audio 권한만 부여 권장)
  OPENAI_API_KEY: z.string().optional(),
  // tts-1-hd가 자연성·발음 명료도 모두 우월 (비용 2배지만 시연·현장 가치 ↑)
  OPENAI_TTS_MODEL: z.enum(['tts-1', 'tts-1-hd']).default('tts-1-hd'),
  OPENAI_TTS_VOICE: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).default('nova'),
  OPENAI_TTS_MAX_CHARS: z.coerce.number().int().min(50).max(4000).default(800),
  OPENAI_TTS_FORMAT: z.enum(['mp3', 'opus', 'aac', 'flac']).default('mp3'),
  // TTS 속도: 1.0=기본, 0.85=차분, 1.1=빠름. 자연 대화에는 0.95~1.05 권장
  OPENAI_TTS_SPEED: z.coerce.number().min(0.25).max(4.0).default(1.0),
  // TTS 비용 통제 — 사용자별 일/월 글자 한도. tts-1 기준 $15/1M chars.
  // 기본 50k/일(=$0.75) × 30일 = 500k/월(=$7.5)/사용자. admin/quarantine_officer는 우회.
  // 한도 도달 시 429 + Retry-After. Redis 미사용 시 자동 우회(graceful).
  TTS_DAILY_CHAR_LIMIT: z.coerce.number().int().min(0).default(50000),
  TTS_MONTHLY_CHAR_LIMIT: z.coerce.number().int().min(0).default(500000),

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
