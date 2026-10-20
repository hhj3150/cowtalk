// 게이트웨이 기록 확인 — AI가 진료 기록을 사용자 확인 없이 저장하지 못하는가
//
// 재현하는 위험:
//   1) AI가 기록 도구를 부르면 즉시 저장되던 것
//   2) AI가 같은 턴에서 스스로 "확인" 호출을 하는 것
//   3) 확인 직전에 AI가 개체를 바꿔 넣는 것
//   4) 같은 확인으로 두 번 저장되는 것 (재시도·중복 호출)

import { describe, it, expect, vi, beforeEach } from 'vitest';

const COW_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COW_A2 = 'abababab-abab-abab-abab-abababababab';

// ── DB(감사 로그) 스텁 ──
vi.mock('../../../config/database.js', () => ({
  getDb: () => ({ insert: () => ({ values: () => Promise.resolve() }) }),
}));

// ── 스코프는 이 테스트의 관심사가 아니다 (tool-scope.test.ts 담당) ──
vi.mock('../tool-scope.js', () => ({
  resolveAllowedFarms: () => null,
  findScopeViolations: () => Promise.resolve([]),
  describeViolations: () => 'denied',
  intersectRequestedFarms: (r: readonly string[]) => r,
}));

// ── 실제 저장 = executeTool 호출 횟수로 관찰 ──
const executed: Array<{ tool: string; input: Record<string, unknown> }> = [];
vi.mock('../tool-executor.js', () => ({
  executeTool: (tool: string, input: Record<string, unknown>) => {
    executed.push({ tool, input });
    return Promise.resolve(JSON.stringify({ success: true }));
  },
}));

// ── 확인 저장소: DB 대신 메모리, 규칙은 서비스와 동일 (같은 사용자·대기 중·다른 턴) ──
interface Row { toolName: string; toolInput: Record<string, unknown>; userId?: string; turnId: string; status: string }
const store = new Map<string, Row>();
let seq = 0;
vi.mock('../../../services/approval/write-confirmation.service.js', () => ({
  createWriteProposal: (p: { toolName: string; toolInput: Record<string, unknown>; userId?: string; turnId: string }) => {
    const id = `conf-${++seq}`;
    store.set(id, { toolName: p.toolName, toolInput: p.toolInput, userId: p.userId, turnId: p.turnId, status: 'awaiting' });
    return Promise.resolve(id);
  },
  claimWriteProposal: (p: { confirmationId: string; userId?: string; turnId: string }) => {
    const r = store.get(p.confirmationId);
    if (!r || r.userId !== p.userId) return Promise.resolve({ ok: false, message: 'not found' });
    if (r.status !== 'awaiting') return Promise.resolve({ ok: false, message: '이미 저장된 기록입니다.' });
    if (r.turnId === p.turnId) return Promise.resolve({ ok: false, message: '사용자의 확인 답변을 아직 받지 않았습니다.' });
    r.status = 'executing';
    return Promise.resolve({ ok: true, toolName: r.toolName, toolInput: r.toolInput });
  },
  finishWriteProposal: (id: string, status: string) => { const r = store.get(id); if (r) r.status = status; return Promise.resolve(); },
  cancelWriteProposal: (id: string, _u?: string, turnId?: string) => { const r = store.get(id); if (r && r.status === 'awaiting' && r.turnId !== turnId) r.status = 'cancelled'; return Promise.resolve(); },
  getProposalTurnId: (id: string, userId?: string) => { const r = store.get(id); return Promise.resolve(r && r.userId === userId ? r.turnId : null); },
  describeAnimal: () => Promise.resolve('송영신목장 123번'),
}));

const { executeToolWithGateway } = await import('../tool-gateway.js');

const vet = (turnId: string, userUtterance: string) => ({
  userId: 'vet-1',
  role: 'veterinarian',
  assignedFarmIds: ['11111111-1111-1111-1111-111111111111'],
  confirmationTurn: { turnId, userUtterance },
});

const TREATMENT = { animalId: COW_A, diagnosis: '자궁염', drug: '세프티오퍼', dosage: '20ml' };

async function propose(turnId = 't1'): Promise<string> {
  const r = await executeToolWithGateway('record_treatment', TREATMENT, vet(turnId, '오늘 자궁염으로 진단했어. 기록해 줘'));
  const parsed = JSON.parse(r.result) as { confirmationRequired?: boolean; confirmationId?: string; summary?: string };
  expect(parsed.confirmationRequired).toBe(true);
  return parsed.confirmationId!;
}

describe('기록 도구 사용자 확인 게이트', () => {
  beforeEach(() => { executed.length = 0; store.clear(); });

  it('1차 호출은 저장하지 않고 개체가 드러난 요약을 돌려준다', async () => {
    const r = await executeToolWithGateway('record_treatment', TREATMENT, vet('t1', '자궁염 기록해 줘'));
    const parsed = JSON.parse(r.result) as { summary: string };
    expect(executed).toHaveLength(0);
    expect(parsed.summary).toContain('송영신목장 123번');
    expect(parsed.summary).toContain('자궁염');
  });

  it('다음 턴에 사용자가 승인하면 저장된다', async () => {
    const id = await propose('t1');
    const r = await executeToolWithGateway('record_treatment', { ...TREATMENT, confirmationId: id }, vet('t2', '확인했어. 저장해'));
    expect(r.success).toBe(true);
    expect(executed).toHaveLength(1);
  });

  it('같은 턴에서 AI가 스스로 확인하면 거부 (자기 승인 차단)', async () => {
    const id = await propose('t1');
    // 같은 턴의 사용자 발화가 "기록해 줘"라 승인처럼 보여도 턴이 같으면 막힌다
    await executeToolWithGateway('record_treatment', { ...TREATMENT, confirmationId: id }, vet('t1', '자궁염 기록해 줘'));
    expect(executed).toHaveLength(0);
  });

  it('확인 시 AI가 다른 개체를 넣어도 제안 당시 개체로 저장된다 (바꿔치기 차단)', async () => {
    const id = await propose('t1');
    await executeToolWithGateway('record_treatment', { ...TREATMENT, animalId: COW_A2, confirmationId: id }, vet('t2', '저장해'));
    expect(executed).toHaveLength(1);
    expect(executed[0]!.input.animalId).toBe(COW_A);
    expect(executed[0]!.input).not.toHaveProperty('confirmationId');
  });

  it('같은 확인으로 두 번 저장되지 않는다 (중복 실행 방지)', async () => {
    const id = await propose('t1');
    await executeToolWithGateway('record_treatment', { ...TREATMENT, confirmationId: id }, vet('t2', '저장해'));
    const again = await executeToolWithGateway('record_treatment', { ...TREATMENT, confirmationId: id }, vet('t3', '저장해'));
    expect(executed).toHaveLength(1);
    expect(again.result).toContain('이미 저장된');
  });

  it('사용자가 거부하면 취소되고 저장되지 않는다', async () => {
    const id = await propose('t1');
    const r = await executeToolWithGateway('record_treatment', { ...TREATMENT, confirmationId: id }, vet('t2', '잠깐, 그 소 말고 125번'));
    expect(executed).toHaveLength(0);
    expect(r.result).toContain('취소');
    // 취소된 제안은 이후 승인으로도 살아나지 않는다
    await executeToolWithGateway('record_treatment', { ...TREATMENT, confirmationId: id }, vet('t3', '저장해'));
    expect(executed).toHaveLength(0);
  });

  it('승인이 애매하면 저장하지 않고 제안도 소모하지 않는다', async () => {
    const id = await propose('t1');
    await executeToolWithGateway('record_treatment', { ...TREATMENT, confirmationId: id }, vet('t2', '그 소 마지막 수정일은?'));
    expect(executed).toHaveLength(0);
    await executeToolWithGateway('record_treatment', { ...TREATMENT, confirmationId: id }, vet('t3', '네 저장해'));
    expect(executed).toHaveLength(1);
  });

  it('턴 정보가 없는 경로(확인 불가)는 기본적으로 거부', async () => {
    const r = await executeToolWithGateway('record_treatment', TREATMENT, { userId: 'vet-1', role: 'veterinarian' });
    expect(r.denied).toBe(true);
    expect(executed).toHaveLength(0);
  });

  it('수의사 승인 실행 경로는 확인을 다시 묻지 않는다 (승인이 곧 확인)', async () => {
    await executeToolWithGateway('record_treatment', TREATMENT, { userId: 'vet-1', role: 'veterinarian', trustedExecutor: 'approval' });
    expect(executed).toHaveLength(1);
  });

  it('조회 도구는 확인 없이 바로 실행', async () => {
    await executeToolWithGateway('query_animal', { earTag: '123' }, vet('t1', '123번 보여줘'));
    expect(executed).toHaveLength(1);
  });
});

describe('NEW-05 같은 턴의 발화는 제안에 대한 대답이 아니다', () => {
  it('"다시 기록해줘" 턴에서 AI 가 스스로 확인해도 제안이 취소되지 않고, 다음 턴 "저장해"로 저장된다', async () => {
    const id = await propose('t-retry');
    await executeToolWithGateway('record_treatment', { ...TREATMENT, confirmationId: id }, vet('t-retry', '다시 기록해줘'));
    expect(store.get(id)?.status).toBe('awaiting');
    const r = await executeToolWithGateway('record_treatment', { ...TREATMENT, confirmationId: id }, vet('t-next', '저장해'));
    expect(r.success).toBe(true);
  });
});
