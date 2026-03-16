// 공통 타입 — 모든 도메인에서 공유

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type ConfidenceLevel = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';

export type DataQualityGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export type SortDirection = 'asc' | 'desc';

export interface Timestamp {
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SoftDelete {
  readonly deletedAt: Date | null;
}

export interface AuditFields {
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
}

export interface PaginationParams {
  readonly page: number;
  readonly limit: number;
  readonly sortBy?: string;
  readonly sortDir?: SortDirection;
}

export interface PaginatedResult<T> {
  readonly data: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface DateRange {
  readonly from: Date;
  readonly to: Date;
}

export interface Coordinates {
  readonly lat: number;
  readonly lng: number;
}

export interface DataQuality {
  readonly score: number; // 0-100
  readonly grade: DataQualityGrade;
  readonly issues: readonly string[];
}
