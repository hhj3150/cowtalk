// 레이블 출처 구분 — AI-02
//
// 문제: auto-labeler 가 실제로 알람이 울렸는지 보지 않고 smaXtec 이벤트 1건마다
//   (알람 유형 수 × 7일) 만큼 'confirmed' 레이블을 만들었다 (health_warning 1건 → 35건).
//   출처 컬럼이 없어 threshold-learner·prompt-improver 가 이것을 전문가 판정과 같은 무게로 학습했다.
// 처리(스키마 변경 없이):
//   - 그 방식으로 만든 레이블은 notes 가 아래 접두어로 시작한다 → 학습·통계에서 제외
//   - 새 자동 확진 레이블은 '실제로 울린 알람(predictions)'과 매칭될 때만, 다른 접두어로 남긴다

import { sql, type SQL } from 'drizzle-orm';
import { sovereignAlarmLabels } from '../db/schema.js';

/** 알람 실재 여부를 확인하지 않고 만든 옛 자동 레이블의 notes 접두어 */
export const LEGACY_BLIND_AUTO_LABEL_PREFIX = '자동 레이블: smaXtec';

/** 실제 발사된 알람과 smaXtec 이벤트가 매칭된 자동 확진 레이블 */
export const MATCHED_AUTO_LABEL_PREFIX = '자동 매칭 확진:';

export function isLegacyBlindAutoLabel(notes: string | null | undefined): boolean {
  return (notes ?? '').startsWith(LEGACY_BLIND_AUTO_LABEL_PREFIX);
}

/** drizzle 조건 — 학습·통계에 써도 되는 레이블만 */
export function learnableLabelCondition(): SQL {
  return sql`coalesce(${sovereignAlarmLabels.notes}, '') NOT LIKE ${`${LEGACY_BLIND_AUTO_LABEL_PREFIX}%`}`;
}

/** raw SQL(테이블 별칭 없음)용 */
export function learnableLabelRawCondition(): SQL {
  return sql`coalesce(notes, '') NOT LIKE ${`${LEGACY_BLIND_AUTO_LABEL_PREFIX}%`}`;
}
