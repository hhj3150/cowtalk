// report-scope의 DB 해석기 — 순수 규칙(report-scope.ts)과 분리해 테스트에서 DB를 끌어오지 않게 한다

import { eq } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { animals } from '../../db/schema.js';
import { getAnimalFarmId } from '../../api/middleware/animal-access.js';
import type { ReportScopeResolvers } from './report-scope.js';

export const dbReportScopeResolvers: ReportScopeResolvers = {
  animalFarm: getAnimalFarmId,
  traceFarms: async (traceNo) => {
    const rows = await getDb()
      .select({ farmId: animals.farmId })
      .from(animals)
      .where(eq(animals.traceId, traceNo));
    return rows.map((r) => r.farmId);
  },
};
