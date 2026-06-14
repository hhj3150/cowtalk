// event-feedback 매핑 테스트 — 사용자 farm_event → 정답(ground-truth) feedback 타입
// 농장주가 실제 발생한 사건을 기록하는 것은 추측이 아닌 사실 → 예측 정확도 평가의 정답.
// 부정 피드백(estrus_false/disease_false)은 명시적 feedback API 담당(여기선 양성 확인만).

import { describe, it, expect } from 'vitest';
import { mapEventToFeedbackType } from '../event-feedback.js';

describe('mapEventToFeedbackType', () => {
  it('번식 이벤트 → 번식 정답 피드백', () => {
    expect(mapEventToFeedbackType('breeding', '발정')).toBe('estrus_confirmed');
    expect(mapEventToFeedbackType('breeding', '수정')).toBe('insemination_done');
    expect(mapEventToFeedbackType('breeding', '임신확인')).toBe('pregnancy_confirmed');
    expect(mapEventToFeedbackType('breeding', '유산')).toBe('pregnancy_negative');
  });

  it('건강 이벤트(질병) → disease_confirmed', () => {
    expect(mapEventToFeedbackType('health', '질병')).toBe('disease_confirmed');
  });

  it('정답 신호가 아닌 이벤트는 null (feedback 미적재)', () => {
    // 치료/처치는 효과 여부를 알 수 없음(별도 치료결과추적 배치 담당) → 정답 아님
    expect(mapEventToFeedbackType('treatment', '투약')).toBeNull();
    // 검진/부상/관찰/급이/이동 등은 예측 정확도 정답으로 부적합
    expect(mapEventToFeedbackType('health', '검진')).toBeNull();
    expect(mapEventToFeedbackType('health', '부상')).toBeNull();
    expect(mapEventToFeedbackType('observation', '행동이상')).toBeNull();
    expect(mapEventToFeedbackType('feeding', '식욕부진')).toBeNull();
    expect(mapEventToFeedbackType('movement', '출하')).toBeNull();
  });

  it('subType 누락/공백/미정의는 null (오적재 방지)', () => {
    expect(mapEventToFeedbackType('breeding', null)).toBeNull();
    expect(mapEventToFeedbackType('breeding', undefined)).toBeNull();
    expect(mapEventToFeedbackType('breeding', '  ')).toBeNull();
    expect(mapEventToFeedbackType('breeding', '알수없음')).toBeNull();
    expect(mapEventToFeedbackType('unknown_type', '발정')).toBeNull();
  });

  it('subType 앞뒤 공백은 트림 후 매칭', () => {
    expect(mapEventToFeedbackType('breeding', ' 발정 ')).toBe('estrus_confirmed');
  });
});
