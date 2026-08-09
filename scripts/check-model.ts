// 설정된 Claude 모델이 실제로 동작하는지 확인한다.
//
// 왜 필요한가: Anthropic 은 세대마다 지원 파라미터를 바꾸고, 지원하지 않는 값을
// 보내면 400 을 낸다. 모델 ID 를 바꿨을 때 그게 통하는지는 실제로 한 번 쏴 봐야만
// 알 수 있다 (타입체크·테스트로는 안 잡힌다).
//
// 이 스크립트는 파라미터를 새로 만들지 않고 ai-brain/claude-model-params.ts 의
// 헬퍼를 그대로 쓴다. 검사와 실제 요청이 어긋나면 검사의 의미가 없기 때문이다.
//
// 사용:  npm run check:model
// 필요:  저장소 루트 .env 의 ANTHROPIC_API_KEY
//
// ⚠️ API 키는 출력하지 않는다. 로그·스크린샷으로 새어 나가면 폐기·재발급해야 한다.

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  temperatureParam,
  thinkingParam,
  effortParam,
  thinkingSafeTemperature,
} from '../packages/server/src/ai-brain/claude-model-params.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const API_KEY = process.env.ANTHROPIC_API_KEY;
const CHAT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';
const DEEP_MODEL = process.env.ANTHROPIC_MODEL_DEEP ?? 'claude-opus-5';
const THINKING_BUDGET = Number(process.env.ANTHROPIC_THINKING_BUDGET ?? 2048);
const CHAT_TEMP = Number(process.env.ANTHROPIC_TEMPERATURE_CHAT ?? 0.4);

if (!API_KEY) {
  console.error('✗ ANTHROPIC_API_KEY 가 없습니다.');
  console.error('  저장소 루트의 .env 파일에 ANTHROPIC_API_KEY=... 를 넣고 다시 실행하세요.');
  console.error(`  찾은 경로: ${path.resolve(__dirname, '../.env')}`);
  process.exit(1);
}

interface Probe {
  readonly label: string;
  readonly model: string;
  readonly params: Record<string, unknown>;
}

// 프로덕션에서 실제로 나가는 세 가지 요청 형태.
const PROBES: readonly Probe[] = [
  {
    label: '대화 (팅커벨 기본 응답)',
    model: CHAT_MODEL,
    params: { ...temperatureParam(CHAT_MODEL, CHAT_TEMP) },
  },
  {
    label: '도구 + 깊은 추론 (감별진단 등)',
    model: CHAT_MODEL,
    params: {
      ...thinkingSafeTemperature(CHAT_MODEL, true, CHAT_TEMP),
      ...thinkingParam(CHAT_MODEL, THINKING_BUDGET),
    },
  },
  {
    label: '분석 (개체·농장 해석)',
    model: DEEP_MODEL,
    params: {
      ...temperatureParam(DEEP_MODEL, 0.3),
      ...thinkingParam(DEEP_MODEL, THINKING_BUDGET),
      ...effortParam(DEEP_MODEL, 'high'),
    },
  },
];

/** 요청에 실린 파라미터를 사람이 읽을 수 있게 (키 값은 절대 포함하지 않는다) */
function describe(params: Record<string, unknown>): string {
  const parts: string[] = [];
  if (Object.hasOwn(params, 'temperature')) parts.push(`temperature=${String(params.temperature)}`);
  else parts.push('temperature 없음');
  const thinking = params.thinking as { type?: string; budget_tokens?: number } | undefined;
  if (thinking) {
    parts.push(
      thinking.type === 'adaptive'
        ? 'thinking=adaptive'
        : `thinking=enabled(${String(thinking.budget_tokens)})`,
    );
  }
  const outputConfig = params.output_config as { effort?: string } | undefined;
  if (outputConfig?.effort) parts.push(`effort=${outputConfig.effort}`);
  return parts.join(', ');
}

async function probe(p: Probe): Promise<boolean> {
  const body = {
    model: p.model,
    max_tokens: 32,
    messages: [{ role: 'user', content: '한 단어로 답하세요: 소' }],
    ...p.params,
  };

  let status = 0;
  let detail = '';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY as string,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    status = res.status;
    if (!res.ok) {
      const text = await res.text();
      // 오류 메시지에는 키가 담기지 않지만, 길이는 잘라 로그를 짧게 유지한다.
      detail = text.slice(0, 300);
    }
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
  }

  const ok = status === 200;
  console.log(`${ok ? '✓' : '✗'} ${p.label}`);
  console.log(`    모델: ${p.model}`);
  console.log(`    파라미터: ${describe(p.params)}`);
  console.log(`    결과: HTTP ${status || '연결 실패'}`);
  if (!ok) console.log(`    응답: ${detail}`);
  console.log();
  return ok;
}

console.log('Claude 모델 파라미터 실제 호출 검사');
console.log(`대화 모델: ${CHAT_MODEL}`);
console.log(`분석 모델: ${DEEP_MODEL}`);
console.log();

let allOk = true;
for (const p of PROBES) {
  // 순차 실행 — 실패 시 어느 형태에서 깨졌는지 순서대로 읽히게.
  if (!(await probe(p))) allOk = false;
}

if (allOk) {
  console.log('전부 통과 — 이 모델 조합으로 배포해도 됩니다.');
  process.exit(0);
}

console.log('실패한 형태가 있습니다.');
console.log('.env 에 아래를 넣으면 이전 세대로 즉시 되돌아갑니다:');
console.log('  ANTHROPIC_MODEL=claude-sonnet-4-6');
console.log('  ANTHROPIC_MODEL_DEEP=claude-opus-4-8');
console.log('그리고 실패한 파라미터 조합을 알려주시면 판정 규칙을 고치겠습니다');
console.log('(ai-brain/claude-model-params.ts).');
process.exit(1);
