// 벌크 이벤트 animalId 갭 테스트 — 열린 루프(#4) 미완 부분 마감
// 갭: POST /events/bulk 의 insert 값 매핑에 animalId 가 빠져 있어, 모든 벌크 이벤트가
// animalId:null 로 적재 → recordFarmEventFeedback 의 개체별 예측 매칭(matchAnimalPredictions)이
// 항상 스킵됐다. 단건 POST 는 animalId 를 넣는데 벌크만 누락된 비대칭 버그.

import { describe, it, expect } from 'vitest';
import { mapBulkEventToInsertValues } from '../event.routes.js';

describe('mapBulkEventToInsertValues — 벌크 이벤트 animalId 갭', () => {
  it('animalId 가 있으면 insert 값에 포함한다 (예측 매칭 가능)', () => {
    const v = mapBulkEventToInsertValues(
      { farmId: 'f1', animalId: 'a1', eventType: 'breeding', subType: '발정' },
      'u1',
    );
    expect(v.animalId).toBe('a1');
    expect(v.farmId).toBe('f1');
  });

  it('animalId 가 없으면 null (농장 단위만 적재)', () => {
    const v = mapBulkEventToInsertValues(
      { farmId: 'f1', eventType: 'health', subType: '질병' },
      'u1',
    );
    expect(v.animalId).toBeNull();
  });

  it('eventType 미지정 시 observation 기본값', () => {
    const v = mapBulkEventToInsertValues({ farmId: 'f1' }, 'u1');
    expect(v.eventType).toBe('observation');
  });

  it('description 미지정 시 eventType 폴백 + recordedBy 전달', () => {
    const v = mapBulkEventToInsertValues(
      { farmId: 'f1', eventType: 'breeding', subType: '수정' },
      'u1',
    );
    expect(v.description).toContain('breeding');
    expect(v.recordedBy).toBe('u1');
  });
});
