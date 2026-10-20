// OPS-13 회귀 — 마이그레이션 실패가 경고 로그에만 남아 스키마 불일치 상태로 서비스하던 문제
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ getDb: () => ({}) }));
const { migrationsFailed } = await import('../auto-migrate.js');
const { describeMigrationHealth } = await import('../../api/routes/health.routes.js');

const ok = { ranAt: 't', total: 46, applied: 1, skipped: 45, failed: [], error: null };

describe('OPS-13 migration status', () => {
  it('실패 파일·전체 오류가 있으면 실패로 본다', () => {
    expect(migrationsFailed(ok)).toBe(false);
    expect(migrationsFailed({ ...ok, failed: ['0042_x.sql'] })).toBe(true);
    expect(migrationsFailed({ ...ok, error: 'connect ECONNREFUSED' })).toBe(true);
    expect(migrationsFailed(null)).toBe(false);
  });

  it('헬스체크에 degraded 로 드러나고 파일 이름은 노출하지 않는다', () => {
    const h = describeMigrationHealth({ ...ok, failed: ['0042_smaxtec_event_external_unique.sql'] }, true);
    expect(h.status).toBe('degraded');
    expect(h.detail).not.toContain('0042');
    expect(describeMigrationHealth(ok, true).status).toBe('healthy');
    expect(describeMigrationHealth(null, true).status).toBe('degraded');
    expect(describeMigrationHealth(null, false).status).toBe('healthy');
  });
});
