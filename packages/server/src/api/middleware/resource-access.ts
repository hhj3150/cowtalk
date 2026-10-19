// 리소스별 "id → 소속 농장" 해석기 + 바로 쓰는 미들웨어 모음
//
// requireResourceAccess는 해석기만 받는 얇은 껍데기다. 실제 "이 리소스는 어느 농장 것인가"를
// 아는 것은 스키마이므로, 그 지식을 여기 한 곳에 모은다.
// 라우트는 여기서 만든 미들웨어를 가져다 쓰기만 한다 — 라우트에 스키마 지식이 흩어지지 않는다.

import { eq } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import {
  animalGroups,
  alerts,
  prescriptions,
  predictions,
  treatments,
  healthEvents,
  animals,
} from '../../db/schema.js';
import { requireResourceAccess, type FarmIdResolver } from './animal-access.js';

/** farmId를 직접 들고 있는 테이블용 해석기 생성기 */
function directFarmId(
  run: (id: string) => Promise<{ farmId: string | null }[]>,
): FarmIdResolver {
  return async (id) => {
    const rows = await run(id);
    return rows[0]?.farmId ?? null;
  };
}

// ── 우군(animal_groups) — farmId 직접 보유 ──
const groupFarmId = directFarmId((id) =>
  getDb().select({ farmId: animalGroups.farmId }).from(animalGroups)
    .where(eq(animalGroups.groupId, id)).limit(1),
);

// ── 알림(alerts) — farmId 직접 보유 ──
const alertFarmId = directFarmId((id) =>
  getDb().select({ farmId: alerts.farmId }).from(alerts)
    .where(eq(alerts.alertId, id)).limit(1),
);

// ── 처방전(prescriptions) — farmId 직접 보유. 의료 기록이라 특히 중요 ──
const prescriptionFarmId = directFarmId((id) =>
  getDb().select({ farmId: prescriptions.farmId }).from(prescriptions)
    .where(eq(prescriptions.prescriptionId, id)).limit(1),
);

// ── 예측(predictions) — farmId 직접 보유 ──
const predictionFarmId = directFarmId((id) =>
  getDb().select({ farmId: predictions.farmId }).from(predictions)
    .where(eq(predictions.predictionId, id)).limit(1),
);

// ── 치료(treatments) — farmId가 없다. healthEvents → animals 경유로 찾는다 ──
const treatmentFarmId: FarmIdResolver = async (id) => {
  const rows = await getDb()
    .select({ farmId: animals.farmId })
    .from(treatments)
    .innerJoin(healthEvents, eq(treatments.healthEventId, healthEvents.eventId))
    .innerJoin(animals, eq(healthEvents.animalId, animals.animalId))
    .where(eq(treatments.treatmentId, id))
    .limit(1);
  return rows[0]?.farmId ?? null;
};

/** 우군 접근 검사 — 수정·삭제·구성원 변경 모두 여기를 지나야 한다 */
export const requireGroupAccess = requireResourceAccess({
  param: 'groupId',
  resolveFarmId: groupFarmId,
  label: '우군',
});

/** 알림 접근 검사 */
export const requireAlertAccess = requireResourceAccess({
  param: 'alertId',
  resolveFarmId: alertFarmId,
  label: '알림',
});

/** 액션 접근 검사 — action.routes는 actionId를 alertId로 사용한다 */
export const requireActionAccess = requireResourceAccess({
  param: 'actionId',
  resolveFarmId: alertFarmId,
  label: '액션',
});

/** 처방전 접근 검사 */
export const requirePrescriptionAccess = requireResourceAccess({
  param: 'prescriptionId',
  resolveFarmId: prescriptionFarmId,
  label: '처방전',
});

/** 예측 접근 검사 */
export const requirePredictionAccess = requireResourceAccess({
  param: 'predictionId',
  resolveFarmId: predictionFarmId,
  label: '예측',
});

/** 치료 접근 검사 */
export const requireTreatmentAccess = requireResourceAccess({
  param: 'treatmentId',
  resolveFarmId: treatmentFarmId,
  label: '치료 기록',
});

/** 테스트용 — 해석기 직접 검증 */
export const __resolvers = {
  groupFarmId,
  alertFarmId,
  prescriptionFarmId,
  predictionFarmId,
  treatmentFarmId,
};
