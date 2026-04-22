// 진단 라우트 — event loop lag + 메모리 + 업타임 측정
//
// 인증 없이 접근 가능하지만 노출되는 정보는 운영 지표뿐 (비밀·사용자 데이터 없음):
//   - event loop lag 분위수 (ms)
//   - 메모리 사용량 (MB, 전체값만)
//   - 업타임 (초)
//
// 용도: 외부 모니터링(curl)에서 병목 위치 파악 — cold start / event loop block / OOM
// 사용: GET /api/debug/stats
//       GET /api/debug/stats?reset=1  (histogram 리셋 — 특정 구간 재측정용)

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  getEventLoopStats,
  getMemoryStats,
  getSystemStats,
  resetEventLoopStats,
} from '../../lib/event-loop-monitor.js';

export const debugRouter = Router();

debugRouter.get('/stats', (req: Request, res: Response) => {
  const shouldReset = req.query['reset'] === '1';
  const eventLoop = getEventLoopStats();
  const memory = getMemoryStats();
  const system = getSystemStats();

  if (shouldReset) {
    resetEventLoopStats();
  }

  // 간단한 health 판정 — 외부에서 한눈에 볼 수 있도록
  const loopP99 = eventLoop?.p99Ms ?? 0;
  const heapUsed = memory.heapUsedMB;
  const status =
    loopP99 > 1000 ? 'blocking'       // event loop 1초 이상 지연 — 심각
    : loopP99 > 200 ? 'slow'         // 200ms ~ 1초 — 주의
    : heapUsed > 800 ? 'memory-high' // 힙 800MB 초과 — 메모리 압박
    : 'healthy';

  res.json({
    success: true,
    data: {
      status,
      eventLoop,
      memory,
      system,
      resetApplied: shouldReset,
    },
  });
});
