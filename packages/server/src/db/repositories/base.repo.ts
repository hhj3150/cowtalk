// 기본 Repository 유틸리티

import type { PgTable } from 'drizzle-orm/pg-core';
import { isNull, type SQL } from 'drizzle-orm';
import type { PaginationParams, PaginatedResult } from '@cowtalk/shared';

export interface BaseRepoConfig<T extends PgTable> {
  readonly table: T;
  readonly primaryKey: keyof T['$inferSelect'];
}

export function buildPaginatedQuery(params: PaginationParams) {
  const offset = (params.page - 1) * params.limit;
  return { offset, limit: params.limit };
}

export function buildPaginatedResult<T>(
  data: readonly T[],
  total: number,
  params: PaginationParams,
): PaginatedResult<T> {
  return {
    data,
    total,
    page: params.page,
    limit: params.limit,
    totalPages: Math.ceil(total / params.limit),
  };
}

export function softDeleteFilter(table: { deletedAt: unknown }): SQL {
  return isNull(table.deletedAt as unknown as Parameters<typeof isNull>[0]);
}
