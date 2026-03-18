// 피드백 훅

import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as feedbackApi from '@web/api/feedback.api';
import type { FeedbackInput } from '@web/api/feedback.api';

export function useSubmitFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: FeedbackInput) => feedbackApi.submitFeedback(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
    },
  });
}
