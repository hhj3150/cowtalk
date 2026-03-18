// 센서 훅 — 차트 데이터

import { useQuery } from '@tanstack/react-query';
import * as sensorApi from '@web/api/sensor.api';
import type { TimeRange } from '@web/api/sensor.api';

const STALE_TIME = 5 * 60 * 1000;

export function useSensorHistory(animalId: string | null, range: TimeRange = '24h') {
  return useQuery({
    queryKey: ['sensor', 'history', animalId, range],
    queryFn: () => sensorApi.getSensorHistory(animalId!, range),
    enabled: Boolean(animalId),
    staleTime: STALE_TIME,
  });
}

export function useFarmSensorOverview(farmId: string | null) {
  return useQuery({
    queryKey: ['sensor', 'farm', farmId],
    queryFn: () => sensorApi.getFarmSensorOverview(farmId!),
    enabled: Boolean(farmId),
    staleTime: STALE_TIME,
  });
}
