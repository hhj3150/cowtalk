// 분만 이벤트 중복 제거 단위 테스트
// smaXtec calving_detection + calving_confirmation 쌍 기록 시
// 같은 분만이 2회 카운트되어 분만간격이 0~며칠로 왜곡되는 버그(85fb8fe 후속) 방지

import { describe, it, expect } from 'vitest';
import {
  dedupCalvingDates,
  CALVING_DEDUP_WINDOW_DAYS,
} from '../breeding-pipeline.service.js';

const day = (iso: string) => new Date(iso);

describe('dedupCalvingDates', () => {
  it('빈 배열은 빈 배열 반환', () => {
    expect(dedupCalvingDates([])).toEqual([]);
  });

  it('단일 분만은 그대로 유지', () => {
    const d = day('2026-01-15');
    expect(dedupCalvingDates([d])).toEqual([d]);
  });

  it('detection + confirmation 같은 분만 쌍은 1개로 병합', () => {
    // smaXtec에서 분만 감지 후 며칠 내 확인 이벤트가 따로 기록되는 패턴
    const detection = day('2026-01-15');
    const confirmation = day('2026-01-17'); // 2일 후
    const result = dedupCalvingDates([detection, confirmation]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(detection);
  });

  it('정렬되지 않은 입력도 처리', () => {
    const d1 = day('2026-01-17');
    const d2 = day('2026-01-15');
    const result = dedupCalvingDates([d1, d2]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(d2); // 빠른 날짜 우선
  });

  it('실제 분만간격(약 380일)은 두 분만으로 유지', () => {
    const calving1 = day('2025-01-15');
    const calving2 = day('2026-01-30'); // 380일 후
    const result = dedupCalvingDates([calving1, calving2]);
    expect(result).toHaveLength(2);
  });

  it(`${CALVING_DEDUP_WINDOW_DAYS}일 임계값 경계 확인`, () => {
    const base = day('2026-01-01');
    // 임계값 + 1일 → 별도 분만으로 유지
    const justBeyond = new Date(base.getTime() + (CALVING_DEDUP_WINDOW_DAYS + 1) * 86_400_000);
    expect(dedupCalvingDates([base, justBeyond])).toHaveLength(2);
    // 임계값 정확히 → 동일 분만으로 병합
    const atThreshold = new Date(base.getTime() + CALVING_DEDUP_WINDOW_DAYS * 86_400_000);
    expect(dedupCalvingDates([base, atThreshold])).toHaveLength(1);
  });

  it('detection + confirmation + 다음 분만 — detection 1회 + 다음 분만 1회 = 2회', () => {
    const c1Detection = day('2025-01-15');
    const c1Confirmation = day('2025-01-18');
    const c2 = day('2026-02-01'); // 약 380일 후
    const result = dedupCalvingDates([c1Detection, c1Confirmation, c2]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(c1Detection);
    expect(result[1]).toEqual(c2);
  });
});
