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
  // 대화·추출 경로(빠른 응답) / 분석 경로(깊은 임상 추론).
  // 파라미터 호환성은 ai-brain/claude-model-params.ts 가 모델 ID 로 판정하므로,
  // 여기 값만 바꾸면 된다 — 호출부에 모델별 분기가 흩어져 있지 않다.
  // 롤백은 환경변수 ANTHROPIC_MODEL / ANTHROPIC_MODEL_DEEP 로 즉시 가능하다.
  // ⚠️ 기본값은 현재 운영 중인 세대를 유지한다. Claude 5 로 올리는 것은 실 API 확인
  //    (npm run check:model) 이 끝난 뒤 환경변수로 먼저 전환하고, 안정되면 여기를 바꾼다.
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),
  ANTHROPIC_MODEL_DEEP: z.string().default('claude-opus-4-8'),
  // adaptive thinking 활성화 시 thinking 토큰이 max_tokens 를 잠식 → JSON 답변 잘림 방지 위해 상향.
  // 비-스트리밍 messages.create 는 ~16K 이하 권장(SDK 타임아웃). 8000 = thinking + JSON 여유.
  ANTHROPIC_MAX_TOKENS_ANALYSIS: z.coerce.number().default(8000),
  // deep(Opus) 분석 경로 effort — 임상추론 깊이. high=기본, max=정확도 최우선(비용↑).
  ANTHROPIC_ANALYSIS_EFFORT: z.enum(['low', 'medium', 'high', 'max']).default('high'),
  // 4000 → 8000. thinking 이 고정 budget(2048)에서 adaptive 로 바뀌면서 Claude 가
  // 추론 깊이를 스스로 정한다 — 상한이 4000 이면 감별진단처럼 추론이 깊은 질문에서
  // 추론 토큰이 답변 몫을 잠식해 문장이 잘린다. max_tokens 는 상한일 뿐이라
  // 짧은 답변의 비용·지연에는 영향이 없다. (채팅 경로는 스트리밍이라
  // 비-스트리밍 messages.create 의 ~16K 권장 한도와는 무관)
  ANTHROPIC_MAX_TOKENS_CHAT: z.coerce.number().default(8000),
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

  // ── 음성 어시스턴트 (voice/) ──────────────────────────────
  // 공급자는 환경변수로 갈아끼운다. 미설정이면 설정된 것으로 자동 폴백한다.
  // ⚠️ CLOVA 경로는 키가 없어 실 호출 검증을 못 했다 — 키 확보 후 스모크 필수.
  VOICE_STT_PROVIDER: z.enum(['whisper', 'clova']).default('whisper'),
  // OpenAI 전사 모델. gpt-4o-transcribe 가 whisper-1 보다 오류율이 낮고
  // 같은 키·같은 엔드포인트를 쓴다. 문제가 생기면 'whisper-1' 로 되돌린다.
  OPENAI_STT_MODEL: z.string().default('gpt-4o-transcribe'),
  // 농장 개체번호를 STT 힌트로 주입할지. 번호 공간이 닫혀 있어 효과가 크다.
  VOICE_ROSTER_HINTS: z.coerce.boolean().default(true),
  VOICE_TTS_PROVIDER: z.enum(['openai', 'clova']).default('openai'),
  CLOVA_CLIENT_ID: z.string().optional(),
  CLOVA_CLIENT_SECRET: z.string().optional(),
  CLOVA_TTS_SPEAKER: z.string().default('nara'),

  // 음성 전용 모델 — 전역 ANTHROPIC_MODEL 은 건드리지 않는다.
  // 단순 조회는 빠른 모델로 보내 TTFT 를 줄인다(비용도 1/5).
  // 주력은 전역 기본값과 같은 세대를 쓰되, 환경변수로 먼저 올릴 수 있게 분리했다.
  VOICE_MODEL_FAST: z.string().default('claude-haiku-4-5'),
  VOICE_MODEL_MAIN: z.string().default('claude-sonnet-4-6'),
  // 음성 답변은 1~2문장이다. 상한을 낮게 잡아 지연과 비용을 함께 누른다.
  VOICE_MAX_TOKENS: z.coerce.number().int().min(128).max(4000).default(700),
  VOICE_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.3),
  // 음성은 추론 지연을 감당할 수 없다 — 기본 low.
  VOICE_EFFORT: z.enum(['low', 'medium', 'high', 'max']).default('low'),
  // TTS 절단 — 답변이 길어지면 앞부분만 말한다(자막은 전체가 나간다)
  VOICE_TTS_MAX_CHARS: z.coerce.number().int().min(50).max(2000).default(400),
  VOICE_TTS_SPEED: z.coerce.number().min(0.5).max(2.0).default(1.0),
  // STT 신뢰도가 이보다 낮으면 추측하지 않고 되묻는다.
  // 공급자가 신뢰도를 주지 않으면(Whisper) 이 검사는 건너뛴다.
  VOICE_STT_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.55),

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
