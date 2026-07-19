// 알림 게이트 테스트 — 무음시간(자정 넘김 포함)·민감도·critical 우회

import { describe, it, expect } from 'vitest';
import {
  parseHHMM,
  isInQuietHours,
  passesSeverity,
  shouldDeliver,
  type ChannelPreference,
} from './notification-gate.service.js';

function pref(partial: Partial<ChannelPreference> = {}): ChannelPreference {
  return {
    isEnabled: true,
    minSeverity: 'low',
    quietHoursStart: null,
    quietHoursEnd: null,
    ...partial,
  };
}

/** 로컬 시간 HH:MM의 Date 생성 */
function at(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(2026, 6, 18, h, m, 0, 0);
  return d;
}

describe('parseHHMM', () => {
  it('정상 형식을 분으로 변환한다', () => {
    expect(parseHHMM('06:30')).toBe(390);
    expect(parseHHMM('0:00')).toBe(0);
    expect(parseHHMM('23:59')).toBe(1439);
  });

  it('잘못된 형식·범위는 null', () => {
    expect(parseHHMM('25:00')).toBeNull();
    expect(parseHHMM('12:60')).toBeNull();
    expect(parseHHMM('abc')).toBeNull();
    expect(parseHHMM(null)).toBeNull();
    expect(parseHHMM('')).toBeNull();
  });
});

describe('isInQuietHours', () => {
  it('일반 범위 (09:00~18:00)', () => {
    expect(isInQuietHours(600, '09:00', '18:00')).toBe(true); // 10:00
    expect(isInQuietHours(480, '09:00', '18:00')).toBe(false); // 08:00
    expect(isInQuietHours(1080, '09:00', '18:00')).toBe(false); // 18:00 (끝은 미포함)
  });

  it('자정 넘는 범위 (22:00~06:00)', () => {
    expect(isInQuietHours(23 * 60, '22:00', '06:00')).toBe(true); // 23:00
    expect(isInQuietHours(2 * 60, '22:00', '06:00')).toBe(true); // 02:00
    expect(isInQuietHours(12 * 60, '22:00', '06:00')).toBe(false); // 12:00
  });

  it('시작==끝 또는 미설정이면 무음시간 없음', () => {
    expect(isInQuietHours(600, '09:00', '09:00')).toBe(false);
    expect(isInQuietHours(600, null, '09:00')).toBe(false);
    expect(isInQuietHours(600, '09:00', null)).toBe(false);
  });
});

describe('passesSeverity', () => {
  it('minSeverity 이상만 통과한다', () => {
    expect(passesSeverity('high', 'critical')).toBe(true);
    expect(passesSeverity('high', 'high')).toBe(true);
    expect(passesSeverity('high', 'medium')).toBe(false);
    expect(passesSeverity('low', 'low')).toBe(true);
  });

  it('알 수 없는 값은 보수적으로 통과 (알림 유실 방지)', () => {
    expect(passesSeverity('unknown', 'high')).toBe(true);
    expect(passesSeverity('high', 'unknown')).toBe(true);
  });
});

describe('shouldDeliver', () => {
  it('설정 없음(null)이면 발송한다 (기본 허용)', () => {
    expect(shouldDeliver(null, 'low')).toBe(true);
  });

  it('채널 비활성이면 critical도 차단한다 (명시적 거부는 존중)', () => {
    expect(shouldDeliver(pref({ isEnabled: false }), 'critical')).toBe(false);
  });

  it('minSeverity 미달은 차단한다', () => {
    expect(shouldDeliver(pref({ minSeverity: 'critical' }), 'high')).toBe(false);
    expect(shouldDeliver(pref({ minSeverity: 'critical' }), 'critical')).toBe(true);
  });

  it('무음시간에는 차단하되 critical은 우회한다', () => {
    const quiet = pref({ quietHoursStart: '22:00', quietHoursEnd: '06:00' });
    expect(shouldDeliver(quiet, 'high', at('23:30'))).toBe(false);
    expect(shouldDeliver(quiet, 'critical', at('23:30'))).toBe(true);
    expect(shouldDeliver(quiet, 'high', at('12:00'))).toBe(true);
  });
});
