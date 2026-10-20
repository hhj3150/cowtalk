// AI-08: AI 출력 출처 지문 — 같은 입력·같은 프롬프트였는지 나중에 대조할 수 있게 한다.
import { createHash } from 'node:crypto';

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// 키 순서와 무관하게 같은 값이면 같은 문자열 (객체 키 정렬)
function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function inputHash(value: unknown): string {
  return sha256Hex(stableStringify(value));
}
