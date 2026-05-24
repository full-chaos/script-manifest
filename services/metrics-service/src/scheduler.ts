import type { TrustProofMetricsRepository } from "./repository.js";

export const SNAPSHOT_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

type TimerHandle = ReturnType<typeof setInterval>;

export type SchedulerClock = {
  setInterval(callback: () => void, ms: number): TimerHandle | number;
  clearInterval(handle: TimerHandle | number): void;
};

export type MetricsScheduler = {
  start(): Promise<void>;
  stop(): void;
  isReady(): boolean;
};

export function createScheduler(
  repository: TrustProofMetricsRepository,
  clock: SchedulerClock = { setInterval, clearInterval }
): MetricsScheduler {
  let handle: TimerHandle | number | null = null;
  let ready = false;

  async function refresh(): Promise<void> {
    await repository.refreshSnapshot();
    await repository.pruneSnapshots();
    ready = true;
  }

  return {
    async start() {
      const existing = await repository.getLatestSnapshot();
      if (!existing) {
        await refresh();
      } else {
        ready = true;
      }

      handle = clock.setInterval(() => {
        void refresh().catch(() => {
          ready = false;
        });
      }, SNAPSHOT_REFRESH_INTERVAL_MS);
    },
    stop() {
      if (handle !== null) {
        clock.clearInterval(handle);
        handle = null;
      }
    },
    isReady() {
      return ready;
    }
  };
}
