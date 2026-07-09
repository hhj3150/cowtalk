// 잡 스케줄러 추상화 — BullMQ(Redis) 우선, 불가 시 in-process 타이머 폴백
//
// 배경: 기존 파이프라인은 setInterval/setTimeout in-process 타이머라
// ① 프로세스 재시작 시 주기 리셋(24h 배치가 통째로 밀림) ② 다중 인스턴스 수평 확장 불가.
// BullMQ 반복 잡으로 전환하되, Redis가 없는 배포(REDIS_ENABLED=false)에서는
// 기존 타이머 의미론을 그대로 재현해 동작 변화가 없도록 한다 (비파괴).
//
// 잡 의미론 2종:
// - interval: 고정 주기 (기존 setInterval 대응)
// - completionBased: 완료 후 (주기 - 소요시간, 최소 minGapMs) 대기 뒤 재실행
//   (실시간 smaXtec 사이클 — 소요가 주기를 넘어도 스킵 없이 이어짐)
//   BullMQ 모드에서는 고정 반복 + 핸들러 내부의 중복 실행 가드(isCycleRunning)에
//   의존한다 — 반복 잡 인스턴스는 큐 차원에서 1개씩만 처리되므로 인스턴스 간 안전.

import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

export interface RepeatableJob {
  readonly name: string;
  readonly everyMs: number;
  readonly handler: () => Promise<void>;
  /** true: 완료 기준 자기-스케줄 (in-process 모드에서만 의미) */
  readonly completionBased?: boolean;
  /** completionBased 최소 간격 (기본 30s) */
  readonly minGapMs?: number;
  /** 시작 즉시 1회 실행 여부 */
  readonly runOnStart?: boolean;
}

export interface JobScheduler {
  readonly mode: 'bullmq' | 'in-process';
  start(jobs: readonly RepeatableJob[]): Promise<void>;
  stop(): Promise<void>;
}

// ===========================
// in-process 폴백 (기존 의미론 재현)
// ===========================

export class InProcessScheduler implements JobScheduler {
  readonly mode = 'in-process' as const;
  private handles: Array<ReturnType<typeof setTimeout>> = [];
  private running = false;

  async start(jobs: readonly RepeatableJob[]): Promise<void> {
    this.running = true;
    for (const job of jobs) {
      if (job.completionBased) {
        this.scheduleCompletionBased(job, job.runOnStart ? 0 : job.everyMs);
      } else {
        const handle = setInterval(() => {
          void job.handler().catch((err) => {
            logger.error({ err, job: job.name }, '[Scheduler] 잡 실행 실패 — 다음 주기에 재시도');
          });
        }, job.everyMs);
        this.handles.push(handle as unknown as ReturnType<typeof setTimeout>);
        if (job.runOnStart) {
          void job.handler().catch((err) => {
            logger.error({ err, job: job.name }, '[Scheduler] 초기 실행 실패');
          });
        }
      }
    }
    logger.info({ jobs: jobs.map((j) => j.name) }, '[Scheduler] in-process 모드 시작');
  }

  private scheduleCompletionBased(job: RepeatableJob, delayMs: number): void {
    if (!this.running) return;
    const handle = setTimeout(() => {
      void (async () => {
        const started = Date.now();
        try {
          await job.handler();
        } catch (err) {
          logger.error({ err, job: job.name }, '[Scheduler] 잡 실행 실패 — 다음 주기에 재시도');
        }
        const elapsed = Date.now() - started;
        const nextDelay = Math.max(job.minGapMs ?? 30_000, job.everyMs - elapsed);
        this.scheduleCompletionBased(job, nextDelay);
      })();
    }, delayMs);
    this.handles.push(handle);
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const h of this.handles) {
      clearTimeout(h);
      clearInterval(h as unknown as ReturnType<typeof setInterval>);
    }
    this.handles = [];
  }
}

// ===========================
// BullMQ 모드
// ===========================

/** bullmq는 자체 번들 ioredis 타입을 쓰므로 인스턴스가 아닌 접속 옵션 객체를 넘긴다 */
export interface RedisConnectionOpts {
  readonly host: string;
  readonly port: number;
  readonly password?: string;
  readonly maxRetriesPerRequest: null;
}

export class BullMqScheduler implements JobScheduler {
  readonly mode = 'bullmq' as const;
  private queues: Queue[] = [];
  private workers: Worker[] = [];

  constructor(private readonly connection: RedisConnectionOpts) {}

  async start(jobs: readonly RepeatableJob[]): Promise<void> {
    for (const job of jobs) {
      const queueName = `cowtalk-pipeline-${job.name}`;
      const queue = new Queue(queueName, { connection: this.connection });
      this.queues.push(queue);

      // 워커: 잡당 1개, 동시성 1 — 반복 인스턴스가 겹치지 않음.
      // 핸들러 내부 가드(isCycleRunning 등)가 이중 안전장치.
      const worker = new Worker(
        queueName,
        async () => {
          await job.handler();
        },
        { connection: this.connection, concurrency: 1 },
      );
      worker.on('failed', (bullJob, err) => {
        logger.error({ err, job: job.name, jobId: bullJob?.id }, '[Scheduler] BullMQ 잡 실패 — 다음 반복에 재시도');
      });
      this.workers.push(worker);

      // 반복 등록 (BullMQ가 (이름, repeat 옵션) 기준으로 중복 등록을 방지)
      await queue.add(job.name, {}, {
        repeat: { every: job.everyMs },
        removeOnComplete: 20,
        removeOnFail: 50,
      });

      // 시작 즉시 1회 (재시작 시 24h 배치가 통째로 밀리는 문제 방지)
      if (job.runOnStart) {
        await queue.add(`${job.name}-boot`, {}, { removeOnComplete: 5, removeOnFail: 5 });
      }
    }
    logger.info({ jobs: jobs.map((j) => j.name) }, '[Scheduler] BullMQ 모드 시작 (Redis 지속 큐)');
  }

  async stop(): Promise<void> {
    await Promise.allSettled(this.workers.map((w) => w.close()));
    await Promise.allSettled(this.queues.map((q) => q.close()));
    this.workers = [];
    this.queues = [];
  }
}

// ===========================
// 팩토리 — Redis 가용성 검사 후 모드 결정
// ===========================

export async function createJobScheduler(): Promise<JobScheduler> {
  if (!config.REDIS_ENABLED) {
    return new InProcessScheduler();
  }
  try {
    // 도달성 검사 (프로브는 즉시 해제)
    const probe = new IORedis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
    });
    await probe.connect();
    await probe.ping();
    probe.disconnect();

    return new BullMqScheduler({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null, // BullMQ Worker 요구사항
    });
  } catch (err) {
    logger.warn({ err }, '[Scheduler] Redis 연결 실패 — in-process 타이머로 폴백');
    return new InProcessScheduler();
  }
}
