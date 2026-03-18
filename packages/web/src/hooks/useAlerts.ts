// 알림 훅

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as alertApi from '@web/api/alert.api';

const STALE_TIME = 5 * 60 * 1000;

export function useAlerts(params?: {
  farmId?: string;
  status?: string;
  priority?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['alerts', params],
    queryFn: () => alertApi.listAlerts(params),
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
  });
}

export function useUpdateAlertStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ alertId, status, notes }: { alertId: string; status: string; notes?: string }) =>
      alertApi.updateAlertStatus(alertId, status, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
