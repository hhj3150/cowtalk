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
  // smaXtec API 키 (sx-...) — 설정 시 세션 토큰 인증 대신 사용 (이메일/비밀번호 불필요)
  SMAXTEC_API_KEY: z.string().optional(),

  // 공공데이터 API
  PUBLIC_DATA_API_KEY: z.string().optional(),

  // Kakao Local REST API (주소→좌표 지오코딩, developers.kakao.com REST API 키)
  KAKAO_REST_API_KEY: z.string().optional(),

  // 젖소 정액추천 외부 데이터 연동 플래그 (데이터 거버넌스 확정 시 true로 전환 — 코드 변경 불필요)
  // 켜지면 dairy-sire-provider의 해당 공급원이 live가 되어 추천 신뢰도가 자동 상승한다.
  DAIRY_DHI_ENABLED: z.coerce.boolean().default(false),        // 젖소 검정데이터(DHI) 연동
  DAIRY_PEDIGREE_ENABLED: z.coerce.boolean().default(false),    // 한국종축개량협회 혈통 연동

  // Anthropic Claude API — 이중 모델 구성
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),
  ANTHROPIC_MODEL_DEEP: z.string().default('claude-opus-4-8'),
  // adaptive thinking 활성화 시 thinking 토큰이 max_tokens 를 잠식 → JSON 답변 잘림 방지 위해 상향.
  // 비-스트리밍 messages.create 는 ~16K 이하 권장(SDK 타임아웃). 8000 = thinking + JSON 여유.
  ANTHROPIC_MAX_TOKENS_ANALYSIS: z.coerce.number().default(8000),
  // deep(Opus) 분석 경로 effort — 임상추론 깊이. high=기본, max=정확도 최우선(비용↑).
  ANTHROPIC_ANALYSIS_EFFORT: z.enum(['low', 'medium', 'high', 'max']).default('high'),
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
  // ⚠️ 모델 선택은 기본적으로 model-registry가 담당한다.
  //    부팅 시 OpenAI에 "이 키로 쓸 수 있는 모델"을 물어 선호 순위 중 최상위를 확정한다.
  //    아래 값은 "운영자가 특정 모델로 고정하고 싶을 때"만 의미가 있다 —
  //    환경변수를 명시하면 레지스트리가 그 뜻을 존중해 조회 결과보다 우선한다(env-pinned).
  //    기본값은 검증용일 뿐 강제 핀이 아니다(registry는 원본 env를 본다).
  // gpt-4o-mini-tts: 자연성이 tts-1-hd보다 높으면서 단가는 더 낮고,
  // instructions로 말투(톤·속도·감정)를 지정할 수 있다 → 팅커벨 페르소나를 음성에도 입힌다.
  OPENAI_TTS_MODEL: z.enum(['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts']).default('gpt-4o-mini-tts'),
  OPENAI_TTS_VOICE: z
    .enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'coral', 'sage', 'ash', 'ballad', 'verse'])
    .default('nova'),
  // 말투 지시 (gpt-4o-mini-tts 전용). 현장에서 알아듣기 쉬운 또렷하고 차분한 톤.
  OPENAI_TTS_INSTRUCTIONS: z
    .string()
    .default(
      '한국 목장의 축산 전문 조수처럼 말하세요. 차분하고 또렷하게, 과장 없이 신뢰감 있게. ' +
      '숫자와 개체번호는 특히 정확하고 천천히 발음하세요. 축사 소음 속에서도 알아들을 수 있도록 발음을 분명히 하세요.',
    ),
  OPENAI_TTS_MAX_CHARS: z.coerce.number().int().min(50).max(4000).default(800),
  OPENAI_TTS_FORMAT: z.enum(['mp3', 'opus', 'aac', 'flac']).default('mp3'),
  // TTS 속도: 1.0=기본, 0.85=차분, 1.1=빠름. 자연 대화에는 0.95~1.05 권장
  // (gpt-4o-mini-tts는 speed를 받지 않음 — OPENAI_TTS_INSTRUCTIONS로 속도를 지시한다)
  OPENAI_TTS_SPEED: z.coerce.number().min(0.25).max(4.0).default(1.0),

  // STT 모델 — 미설정 시 model-registry가 최신 가용 모델을 확정한다.
  // 명시하면 그 값으로 고정된다. gpt-4o-transcribe가 한국어 축산 전문어 인식률이 whisper-1보다 높다.
  OPENAI_STT_MODEL: z
    .enum(['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe'])
    .default('gpt-4o-transcribe'),

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
