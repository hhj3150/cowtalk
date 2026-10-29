// Redis 접속 설정 판정 — 접속 정보가 없으면 연결하지 않는다, REDIS_ENABLED=false 는 실제로 끈다
import { describe, it, expect } from 'vitest';
import { resolveRedisSettings, parseRedisEnabled } from '../redis-settings.js';

describe('parseRedisEnabled', () => {
  it('미설정·빈 값은 사용(true)', () => {
    expect(parseRedisEnabled(undefined)).toBe(true);
    expect(parseRedisEnabled('')).toBe(true);
  });
  it('"false" 는 실제로 끈다 (z.coerce.boolean 은 true 로 바꿨다)', () => {
    for (const v of ['false', 'FALSE', '0', 'no', 'off', ' false ']) expect(parseRedisEnabled(v)).toBe(false);
  });
  it('"true"/"1" 은 사용', () => {
    expect(parseRedisEnabled('true')).toBe(true);
    expect(parseRedisEnabled('1')).toBe(true);
  });
});

describe('resolveRedisSettings', () => {
  it('REDIS_ENABLED=false → disabled (접속 정보가 있어도)', () => {
    expect(resolveRedisSettings({ REDIS_ENABLED: 'false', REDIS_URL: 'redis://h:6379' }).state).toBe('disabled');
  });

  it('운영 사례: REDIS_ENABLED 만 있고 접속 정보 없음 → not_configured (localhost 로 시도하지 않음)', () => {
    const s = resolveRedisSettings({ REDIS_ENABLED: 'true' });
    expect(s.state).toBe('not_configured');
  });

  it('REDIS_URL 을 해석한다 (Railway 형식)', () => {
    const s = resolveRedisSettings({ REDIS_URL: 'redis://default:p%40ss@redis.railway.internal:6380/2' });
    expect(s.state).toBe('configured');
    if (s.state !== 'configured') return;
    expect(s.connection).toEqual({ host: 'redis.railway.internal', port: 6380, username: 'default', password: 'p@ss', db: 2 });
    expect(s.detail).not.toContain('p@ss'); // 비밀번호를 상태 문구에 싣지 않는다
  });

  it('rediss:// 는 TLS', () => {
    const s = resolveRedisSettings({ REDIS_URL: 'rediss://h' });
    expect(s.state === 'configured' && s.connection.tls).toEqual({});
    expect(s.state === 'configured' && s.connection.port).toBe(6379);
  });

  it('REDIS_URL 이 HOST 보다 우선', () => {
    const s = resolveRedisSettings({ REDIS_URL: 'redis://from-url:1', REDIS_HOST: 'from-host' });
    expect(s.state === 'configured' && s.connection.host).toBe('from-url');
  });

  it('REDIS_HOST/PORT/PASSWORD (기존 방식) 도 그대로 동작', () => {
    const s = resolveRedisSettings({ REDIS_HOST: 'localhost', REDIS_PORT: '6379', REDIS_PASSWORD: '' });
    expect(s.state).toBe('configured');
    expect(s.state === 'configured' && s.connection).toEqual({ host: 'localhost', port: 6379 });
  });

  it('잘못된 URL·포트 → invalid (비밀번호를 문구에 남기지 않음)', () => {
    const bad = resolveRedisSettings({ REDIS_URL: 'http://user:secret@h' });
    expect(bad.state).toBe('invalid');
    expect(bad.detail).not.toContain('secret');
    expect(resolveRedisSettings({ REDIS_URL: 'not a url secret' }).detail).not.toContain('secret');
    expect(resolveRedisSettings({ REDIS_HOST: 'h', REDIS_PORT: 'abc' }).state).toBe('invalid');
  });
});
