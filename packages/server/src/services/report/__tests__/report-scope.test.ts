import { describe, it, expect } from 'vitest';
import { scopeReportParams, type ReportScopeResolvers } from '../report-scope.js';
import { NO_FARM_SENTINEL } from '../../../api/middleware/rbac.js';

const FARM_A = '11111111-1111-1111-1111-111111111111';
const FARM_B = '22222222-2222-2222-2222-222222222222';
const COW_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COW_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TRACE_A = '002132665191';
const TRACE_B = '002999999999';

const resolvers: ReportScopeResolvers = {
  animalFarm: (id) => Promise.resolve(id === COW_A ? FARM_A : id === COW_B ? FARM_B : null),
  traceFarms: (t) => Promise.resolve(t === TRACE_A ? [FARM_A] : t === TRACE_B ? [FARM_B] : []),
};

describe('scopeReportParams', () => {
  it('무제한 스코프는 그대로', async () => {
    const r = await scopeReportParams({ traceNo: TRACE_B }, null, resolvers);
    expect(r).toEqual({ ok: true, params: { traceNo: TRACE_B } });
  });

  // 실제 취약점 재현 — 귀표 이력번호만으로 남의 소 보고서가 생성됐다
  it('남의 목장 이력번호는 거부', async () => {
    const r = await scopeReportParams({ traceNo: TRACE_B }, [FARM_A], resolvers);
    expect(r).toMatchObject({ ok: false, reason: 'out_of_scope' });
  });

  it('내 목장 이력번호는 허용', async () => {
    const r = await scopeReportParams({ traceNo: TRACE_A }, [FARM_A], resolvers);
    expect(r.ok).toBe(true);
  });

  it('범위 밖 farmId 거부', async () => {
    const r = await scopeReportParams({ farmId: FARM_B }, [FARM_A], resolvers);
    expect(r).toMatchObject({ ok: false, reason: 'out_of_scope' });
  });

  it('범위 밖 animalId 거부', async () => {
    const r = await scopeReportParams({ farmId: FARM_A, animalId: COW_B }, [FARM_A], resolvers);
    expect(r).toMatchObject({ ok: false, reason: 'out_of_scope' });
  });

  it('없는 이력번호는 not_found', async () => {
    const r = await scopeReportParams({ traceNo: '000000000000' }, [FARM_A], resolvers);
    expect(r).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('식별자가 없고 배정 목장이 하나면 그 목장으로 한정 (전국 집계 방지)', async () => {
    const r = await scopeReportParams({}, [FARM_A], resolvers);
    expect(r).toEqual({ ok: true, params: { farmId: FARM_A } });
  });

  it('식별자가 없고 여러 목장 담당이면 목장 선택 요구', async () => {
    const r = await scopeReportParams({}, [FARM_A, FARM_B], resolvers);
    expect(r).toMatchObject({ ok: false, reason: 'farm_required' });
  });

  it('미배정 사용자는 거부', async () => {
    const r = await scopeReportParams({}, [NO_FARM_SENTINEL], resolvers);
    expect(r).toMatchObject({ ok: false, reason: 'farm_required' });
  });
});
