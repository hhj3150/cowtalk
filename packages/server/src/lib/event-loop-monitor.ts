// Event loop lag + 메모리 + 시스템 상태 계측
//
// 목적: "로그인 후 느림" 원인이 event loop 블로킹인지 네트워크인지 분리
// 사용: /api/debug/stats 엔드포인트에서 스냅샷 반환
//
// 핵심 개념:
// - monitorEventLoopDelay(): Node가 제공하는 histogram — microsecond 단위로
//   event loop이 예상보다 얼마나 늦게 실행됐는지 기록
// - > 100ms = 사용자 체감 지연 시작
// - > 1000ms = 심각한 블로킹 (API 응답 지연)

import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';

let histogram: IntervalHistogram | null = null;
let startedAt: number = Date.now();

export function startEventLoopMonitor(): void {
  if (histogram) return;
  histogram = monitorEventLoopDelay({ resolution: 20 }); // 20ms 해상도
  histogram.enable();
  startedAt = Date.now();
}

export function stopEventLoopMonitor(): void {
  if (!histogram) return;
  histogram.disable();
  histogram = null;
}

export interface EventLoopStats {
  readonly minMs: number;
  readonly maxMs: number;
  readonly meanMs: number;
  readonly stddevMs: number;
  readonly p50Ms: number;
  readonly p90Ms: number;
  readonly p99Ms: number;
  readonly p999Ms: number;
  readonly windowSec: number; // 누적 시작 이후 경과 초
}

export function getEventLoopStats(): EventLoopStats | null {
  if (!histogram) return null;
  // perf_hooks histogram은 나노초 단위 반환 — ms로 변환
  const nsToMs = (ns: number): number => Math.round((ns / 1_000_000) * 100) / 100;
  return {
    minMs: nsToMs(histogram.min),
    maxMs: nsToMs(histogram.max),
    meanMs: nsToMs(histogram.mean),
    stddevMs: nsToMs(histogram.stddev),
    p50Ms: nsToMs(histogram.percentile(50)),
    p90Ms: nsToMs(histogram.percentile(90)),
    p99Ms: nsToMs(histogram.percentile(99)),
    p999Ms: nsToMs(histogram.percentile(99.9)),
    windowSec: Math.round((Date.now() - startedAt) / 1000),
  };
}

/** 누적 histogram을 리셋 — 특정 구간 측정용 */
export function resetEventLoopStats(): void {
  if (!histogram) return;
  histogram.reset();
  startedAt = Date.now();
}

export interface MemoryStats {
  readonly rssMB: number;      // Resident Set Size — OS가 할당한 전체
  readonly heapUsedMB: number; // V8 힙 사용량
  readonly heapTotalMB: number;
  readonly externalMB: number; // Buffer, ArrayBuffer 등
  readonly arrayBuffersMB: number;
}

export function getMemoryStats(): MemoryStats {
  const m = process.memoryUsage();
  const toMB = (b: number): number => Math.round((b / 1024 / 1024) * 10) / 10;
  return {
    rssMB: toMB(m.rss),
    heapUsedMB: toMB(m.heapUsed),
    heapTotalMB: toMB(m.heapTotal),
    externalMB: toMB(m.external),
    arrayBuffersMB: toMB(m.arrayBuffers),
  };
}

export interface SystemStats {
  readonly uptimeSec: number;
  readonly nodeVersion: string;
  readonly pid: number;
  readonly platform: string;
}

export function getSystemStats(): SystemStats {
  return {
    uptimeSec: Math.round(process.uptime()),
    nodeVersion: process.version,
    pid: process.pid,
    platform: process.platform,
  };
}
