// 팅커벨 기억 API — 대화에서 축적된 기억의 조회·수정·삭제

import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { TinkerbellMemory, MemoryCategory } from '@cowtalk/shared';

export interface CreateMemoryInput {
  readonly farmId?: string | null;
  readonly animalId?: string | null;
  readonly category: MemoryCategory;
  readonly subject: string;
  readonly content: string;
  readonly importance?: number;
}

export function fetchMemories(status: string = 'active'): Promise<readonly TinkerbellMemory[]> {
  return apiGet<readonly TinkerbellMemory[]>('/memory', { status });
}

export function createMemory(input: CreateMemoryInput): Promise<{ memoryId: string }> {
  return apiPost<{ memoryId: string }>('/memory', input);
}

export function updateMemory(
  memoryId: string,
  patch: { subject?: string; content?: string; importance?: number },
): Promise<{ memoryId: string }> {
  return apiPatch<{ memoryId: string }>(`/memory/${memoryId}`, patch);
}

export function deleteMemory(memoryId: string): Promise<{ memoryId: string }> {
  return apiDelete<{ memoryId: string }>(`/memory/${memoryId}`);
}
