// 음성 도구 실행 — 기존 25종 위의 얇은 래퍼.
//
// 설계 규칙 셋:
//  1) 반환은 **짧은 문장**이다. 원시 시계열·긴 JSON 을 절대 돌려주지 않는다.
//     길면 첫 문장까지 오래 걸리고, 그게 곧 체감 지연이다.
//  2) 기존 도구는 반드시 executeToolWithGateway 를 통과시킨다.
//     역할별 접근제어·승인 게이트·감사 로그를 우회하는 경로를 만들지 않는다 (지시서 §8).
//  3) 데이터가 없으면 없다고 반환한다. 채워 넣지 않는다.

import { executeToolWithGateway, type ToolCallContext } from '../ai-brain/tools/tool-gateway.js';
import { getRedis } from '../serving/cache.service.js';
import { logger } from '../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';

// ── 제안 대기함 (HITL) ───────────────────────────────────────
// 음성 한 번으로 기록이 실행되면 안 된다. propose → 되읽기 → 확답 → confirm 순서를
// 강제하기 위해 제안을 잠시 보관한다. Redis 를 쓰는 이유는 서버가 여러 대일 때
// 제안과 확답이 다른 인스턴스로 갈 수 있기 때문이다.
const PENDING_PREFIX = 'voice:pending:';
const PENDING_TTL_SEC = 300; // 5분 — 그 안에 확답하지 않으면 사라진다

interface PendingAction {
  readonly animalId: string;
  readonly action: string;
  readonly kind: 'treatment' | 'insemination' | 'note';
  readonly userId?: string;
  readonly farmId?: string;
  readonly createdAt: number;
}

/** Redis 가 없으면 프로세스 메모리로 떨어진다 (단일 인스턴스 개발 환경용) */
const memoryPending = new Map<string, PendingAction>();

async function putPending(id: string, a: PendingAction): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(PENDING_PREFIX + id, JSON.stringify(a), 'EX', PENDING_TTL_SEC);
    return;
  }
  memoryPending.set(id, a);
  setTimeout(() => memoryPending.delete(id), PENDING_TTL_SEC * 1000).unref?.();
}

async function takePending(id: string): Promise<PendingAction | null> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(PENDING_PREFIX + id);
    if (!raw) return null;
    await redis.del(PENDING_PREFIX + id); // 한 번만 실행되게 소비한다
    return JSON.parse(raw) as PendingAction;
  }
  const a = memoryPending.get(id) ?? null;
  if (a) memoryPending.delete(id);
  return a;
}

// ── 유틸 ────────────────────────────────────────────────────

/** 기존 도구 호출 → 문자열 결과. 실패해도 예외를 던지지 않고 사람이 읽을 문장으로 돌려준다. */
async function call(
  toolName: string,
  input: Record<string, unknown>,
  ctx: ToolCallContext,
): Promise<{ text: string; ok: boolean; approvalRequired: boolean }> {
  const r = await executeToolWithGateway(toolName, input, ctx);
  return { text: r.result, ok: r.success, approvalRequired: r.approvalRequired };
}

/**
 * 도구 결과를 음성 길이로 줄인다.
 * 문장 경계에서 자르되, 경계를 못 찾으면 글자 수로 자른다.
 */
export function trimForVoice(text: string, maxChars = 260): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('다 '), cut.lastIndexOf('다.'));
  return lastStop > maxChars * 0.5 ? cut.slice(0, lastStop + 1) : cut;
}

// ── 도구 구현 ────────────────────────────────────────────────

export interface VoiceToolResult {
  readonly content: string;
  /** 승인 대기로 걸렸는가 — 오케스트레이터가 사용자에게 그대로 전한다 */
  readonly approvalRequired?: boolean;
}

export async function runVoiceTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolCallContext,
): Promise<VoiceToolResult> {
  switch (name) {
    case 'get_animal_status': {
      const animalId = String(input.animal_id ?? '');
      if (!animalId) return { content: '개체번호가 없습니다.' };
      // 프로필과 센서를 병렬로 — 순차 호출은 그대로 지연이 된다
      const [profile, sensor] = await Promise.all([
        call('query_animal', { earTag: animalId }, ctx),
        call('query_sensor_data', { animalId, metric: 'temperature', days: 3 }, ctx),
      ]);
      if (!profile.ok) return { content: `${animalId}번 정보를 찾지 못했습니다.` };
      return { content: trimForVoice(`${profile.text} ${sensor.ok ? sensor.text : ''}`) };
    }

    case 'list_alerts': {
      const r = await call('get_farm_kpis', { farmId: ctx.farmId ?? '' }, ctx);
      return { content: r.ok ? trimForVoice(r.text) : '알림을 불러오지 못했습니다.' };
    }

    case 'get_estrus_candidates': {
      const r = await call('query_breeding_stats', { farmId: ctx.farmId ?? '' }, ctx);
      return { content: r.ok ? trimForVoice(r.text) : '발정 정보를 불러오지 못했습니다.' };
    }

    case 'get_barn_environment': {
      const r = await call('query_weather', { farmId: ctx.farmId ?? '' }, ctx);
      return { content: r.ok ? trimForVoice(r.text) : '환경 정보를 불러오지 못했습니다.' };
    }

    case 'propose_action': {
      const animalId = String(input.animal_id ?? '');
      const action = String(input.action ?? '');
      const kind = String(input.kind ?? 'note') as PendingAction['kind'];
      if (!animalId || !action) return { content: '무엇을 기록할지 분명하지 않습니다.' };

      const id = uuidv4();
      await putPending(id, {
        animalId, action, kind,
        ...(ctx.userId ? { userId: ctx.userId } : {}),
        ...(ctx.farmId ? { farmId: ctx.farmId } : {}),
        createdAt: Date.now(),
      });
      // 실행하지 않았음을 모델이 확실히 알도록 문장으로 못박는다
      return {
        content:
          `제안만 만들었습니다. 아직 실행하지 않았습니다. ` +
          `사용자에게 "${animalId}번, ${action}. 기록할까요?"라고 되읽고, ` +
          `확답을 받으면 confirm_action 을 action_id="${id}" 로 호출하세요.`,
      };
    }

    case 'confirm_action': {
      const actionId = String(input.action_id ?? '');
      const pending = actionId ? await takePending(actionId) : null;
      if (!pending) {
        return { content: '확인할 제안이 없거나 시간이 지났습니다. 다시 말씀해 주세요.' };
      }

      // 종류별로 기존 기록 도구에 연결한다. 승인 게이트는 그대로 통과시킨다.
      if (pending.kind === 'treatment') {
        const r = await call(
          'record_treatment',
          { animalId: pending.animalId, diagnosis: pending.action, notes: '음성 기록' },
          ctx,
        );
        return {
          content: r.approvalRequired ? trimForVoice(r.text) : trimForVoice(r.text),
          ...(r.approvalRequired ? { approvalRequired: true } : {}),
        };
      }
      if (pending.kind === 'insemination') {
        const r = await call(
          'record_insemination',
          { animalId: pending.animalId, farmId: pending.farmId ?? ctx.farmId ?? '', notes: pending.action },
          ctx,
        );
        return {
          content: trimForVoice(r.text),
          ...(r.approvalRequired ? { approvalRequired: true } : {}),
        };
      }
      const r = await call(
        'record_expert_label',
        { animalId: pending.animalId, label: pending.action, source: 'voice' },
        ctx,
      );
      return { content: trimForVoice(r.text) };
    }

    case 'log_note': {
      const animalId = String(input.animal_id ?? '');
      const text = String(input.text ?? '');
      if (!animalId || !text) return { content: '메모 내용이 분명하지 않습니다.' };
      const r = await call('record_expert_label', { animalId, label: text, source: 'voice' }, ctx);
      return { content: r.ok ? '메모를 남겼습니다.' : '메모를 남기지 못했습니다.' };
    }

    default:
      logger.warn({ name }, '[voice/tools] 알 수 없는 도구');
      return { content: '그 기능은 아직 없습니다.' };
  }
}
