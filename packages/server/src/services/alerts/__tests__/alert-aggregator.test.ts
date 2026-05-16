// alert-aggregator 순수 함수 테스트 — DB 의존성 없음.
// metrics-contract.md §10 (v0.4) / D3·D5·D11·D13·D14 / BUG-007 Part 2

import { describe, it, expect } from 'vitest';
import {
  buildAlertCountResult,
  computeAlertCount,
  windowToCutoff,
  resolveDomainEventTypes,
  aggregateAlertRowsByProvince,
  listWidgetPresets,
} from '../alert-aggregator.js';

describe('buildAlertCountResult (D5/D13 패턴)', () => {
  it('카운트 0 → status="ok" + displayValue="0" (D13 실측 0건)', () => {
    expect(buildAlertCountResult(0)).toEqual({
      count: 0,
      displayValue: '0',
      status: 'ok',
    });
  });

  it('878건 → "878" 로케일 포맷', () => {
    expect(buildAlertCountResult(878)).toEqual({
      count: 878,
      displayValue: '878',
      status: 'ok',
    });
  });

  it('큰 숫자 (123,456) → 천단위 콤마', () => {
    expect(buildAlertCountResult(123456).displayValue).toBe('123,456');
  });

  it('음수 → "—" (D13 측정 불가)', () => {
    expect(buildAlertCountResult(-3)).toEqual({
      count: 0,
      displayValue: '—',
      status: 'data_insufficient',
    });
  });

  it('NaN → "—" (Number.isFinite 가드)', () => {
    expect(buildAlertCountResult(Number.NaN).status).toBe('data_insufficient');
    expect(buildAlertCountResult(Number.NaN).displayValue).toBe('—');
  });

  it('Infinity → "—"', () => {
    expect(buildAlertCountResult(Number.POSITIVE_INFINITY).status).toBe('data_insufficient');
  });

  it('소수점 → Math.floor', () => {
    expect(buildAlertCountResult(10.7).count).toBe(10);
    expect(buildAlertCountResult(10.7).displayValue).toBe('10');
  });

  it('computeAlertCount는 buildAlertCountResult alias', () => {
    expect(computeAlertCount(50)).toEqual(buildAlertCountResult(50));
  });
});

describe('windowToCutoff', () => {
  const fixedNow = new Date('2026-05-16T12:00:00Z');

  it('24h → 24시간 전 시각', () => {
    const cutoff = windowToCutoff('24h', fixedNow);
    expect(cutoff?.toISOString()).toBe('2026-05-15T12:00:00.000Z');
  });

  it('7d → 7일 전 시각', () => {
    const cutoff = windowToCutoff('7d', fixedNow);
    expect(cutoff?.toISOString()).toBe('2026-05-09T12:00:00.000Z');
  });

  it('30d → 30일 전 시각', () => {
    const cutoff = windowToCutoff('30d', fixedNow);
    expect(cutoff?.toISOString()).toBe('2026-04-16T12:00:00.000Z');
  });

  it('live → null (시간 필터 없음)', () => {
    expect(windowToCutoff('live', fixedNow)).toBeNull();
  });

  it('기본 now 사용 시에도 동작', () => {
    const cutoff = windowToCutoff('24h');
    expect(cutoff).not.toBeNull();
    expect(cutoff!.getTime()).toBeLessThan(Date.now());
  });
});

describe('resolveDomainEventTypes', () => {
  it('breeding 도메인 → 발정·수정·임신·분만·건유 이벤트 타입 리스트', () => {
    const types = resolveDomainEventTypes('breeding');
    expect(types).toContain('estrus');
    expect(types).toContain('insemination');
    expect(types).toContain('pregnancy_check');
    expect(types).toContain('calving_detection');
    expect(types).toContain('dry_off');
  });

  it('health 도메인 → 체온·반추·활동·임상 이벤트 타입 리스트', () => {
    const types = resolveDomainEventTypes('health');
    expect(types).toContain('temperature_high');
    expect(types).toContain('rumination_decrease');
    expect(types).toContain('activity_decrease');
    expect(types).toContain('clinical_condition');
  });

  it('epidemic 도메인 → 법정전염병 이벤트', () => {
    const types = resolveDomainEventTypes('epidemic');
    expect(types).toContain('health_103');
  });

  it('herd 도메인 → 폐사·도태', () => {
    const types = resolveDomainEventTypes('herd');
    expect(types).toContain('mortality');
    expect(types).toContain('culling');
  });

  it('all → null (필터 없음)', () => {
    expect(resolveDomainEventTypes('all')).toBeNull();
  });

  it('도메인 간 eventType 중복 없음 (분류 명확성)', () => {
    const breeding = resolveDomainEventTypes('breeding') ?? [];
    const health = resolveDomainEventTypes('health') ?? [];
    const epidemic = resolveDomainEventTypes('epidemic') ?? [];
    const herd = resolveDomainEventTypes('herd') ?? [];
    const all = [...breeding, ...health, ...epidemic, ...herd];
    const uniq = new Set(all);
    expect(uniq.size).toBe(all.length);
  });
});

describe('aggregateAlertRowsByProvince (D14 패턴)', () => {
  // 9 시도 좌표 (province-mapper PROVINCE_CENTERS 기반)
  const GG_LAT = 37.41; const GG_LNG = 127.52;     // 경기도
  const CN_LAT = 36.51; const CN_LNG = 126.80;     // 충청남도
  const JJ_LAT = 33.49; const JJ_LNG = 126.53;     // 제주

  it('빈 입력 → 9 시도 모두 "0" (실측 0건)', () => {
    const result = aggregateAlertRowsByProvince([]);
    expect(result.size).toBe(9);
    for (const [, alert] of result) {
      expect(alert.status).toBe('ok');
      expect(alert.displayValue).toBe('0');
      expect(alert.count).toBe(0);
    }
  });

  it('경기 100건 + 충남 50건 + 제주 10건 → 정확 집계', () => {
    const rows = [
      ...Array.from({ length: 100 }, () => ({ lat: GG_LAT, lng: GG_LNG })),
      ...Array.from({ length: 50 }, () => ({ lat: CN_LAT, lng: CN_LNG })),
      ...Array.from({ length: 10 }, () => ({ lat: JJ_LAT, lng: JJ_LNG })),
    ];
    const result = aggregateAlertRowsByProvince(rows);
    expect(result.get('경기도')?.count).toBe(100);
    expect(result.get('경기도')?.displayValue).toBe('100');
    expect(result.get('충청남도')?.count).toBe(50);
    expect(result.get('제주특별자치도')?.count).toBe(10);
    expect(result.get('경상북도')?.count).toBe(0); // 미사용 시도도 "0"
  });

  it('해외/미분류 좌표는 제외', () => {
    const rows = [
      { lat: GG_LAT, lng: GG_LNG },
      { lat: null, lng: null },           // 미분류
      { lat: 0, lng: 0 },                  // 해외
      { lat: 40.0, lng: 130.0 },           // 해외
    ];
    const result = aggregateAlertRowsByProvince(rows);
    expect(result.get('경기도')?.count).toBe(1);
    expect(result.has('해외')).toBe(false);
    expect(result.has('미분류')).toBe(false);
  });

  it('항상 9 시도 모두 포함 (caller가 셀 다 그릴 수 있게)', () => {
    const result = aggregateAlertRowsByProvince([]);
    const expected = ['경기도', '강원특별자치도', '충청북도', '충청남도', '전라북도', '전라남도', '경상북도', '경상남도', '제주특별자치도'];
    for (const p of expected) {
      expect(result.has(p)).toBe(true);
    }
  });

  it('큰 데이터 (10,000건 경기) → 천단위 콤마', () => {
    const rows = Array.from({ length: 10000 }, () => ({ lat: GG_LAT, lng: GG_LNG }));
    const result = aggregateAlertRowsByProvince(rows);
    expect(result.get('경기도')?.displayValue).toBe('10,000');
  });
});

describe('Widget presets — D3 일관성', () => {
  it('listWidgetPresets에 메인 대시보드 KPI 4개 모두 등록', () => {
    const presets = listWidgetPresets();
    const ids = presets.map((p) => p.widgetId);
    expect(ids).toContain('main_24h_alerts');
    expect(ids).toContain('main_health_issues');
    expect(ids).toContain('main_breeding_alerts');
    expect(ids).toContain('main_epidemic_alerts');
  });

  it('AI 일일 브리핑과 메인 24h 알림이 동일 opts (878 vs 874 통일)', () => {
    const presets = new Map(listWidgetPresets().map((p) => [p.widgetId, p.opts]));
    const main = presets.get('main_24h_alerts');
    const aiBrief = presets.get('ai_briefing_24h');
    expect(main).toBeDefined();
    expect(aiBrief).toBeDefined();
    expect(main).toEqual(aiBrief);
  });

  it('모든 메인 widget preset이 ackedFilter=false (D3 표준)', () => {
    const presets = listWidgetPresets();
    for (const { widgetId, opts } of presets) {
      // 메인 / AI / regional / epidemiology preset 모두 미확인만
      if (widgetId.startsWith('main_') || widgetId.startsWith('ai_') || widgetId.startsWith('regional_') || widgetId.startsWith('epidemiology_') || widgetId.startsWith('epidemic_')) {
        expect(opts.ackedFilter).toBe(false);
      }
    }
  });

  it('main_health_issues는 health 도메인 필터', () => {
    const presets = new Map(listWidgetPresets().map((p) => [p.widgetId, p.opts]));
    expect(presets.get('main_health_issues')?.domainFilter).toBe('health');
  });

  it('main_breeding_alerts는 breeding 도메인 필터', () => {
    const presets = new Map(listWidgetPresets().map((p) => [p.widgetId, p.opts]));
    expect(presets.get('main_breeding_alerts')?.domainFilter).toBe('breeding');
  });

  it('epidemic_critical은 severity=critical', () => {
    const presets = new Map(listWidgetPresets().map((p) => [p.widgetId, p.opts]));
    expect(presets.get('epidemic_critical')?.severity).toBe('critical');
  });
});
