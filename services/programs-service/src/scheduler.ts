import { randomUUID } from "node:crypto";
import type { request as undiciRequest } from "undici";
import type { ProgramsRepository } from "./repository.js";

export type ProgramsSchedulerJobName =
  | "application_sla_reminder"
  | "session_reminder"
  | "cohort_transition"
  | "kpi_aggregation"
  | "crm_sync_dispatcher";

export type ProgramsSchedulerDependencies = {
  repository: ProgramsRepository;
  requestFn: typeof undiciRequest;
  notificationServiceBase: string;
  logger?: {
    info(payload: Record<string, unknown>, message: string): void;
    error(payload: Record<string, unknown>, message: string): void;
  };
};

export type ProgramsSchedulerJobResult = {
  job: ProgramsSchedulerJobName;
  scanned: number;
  processed: number;
  skipped: number;
  failed: number;
  errors: string[];
};

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

async function publishNotification(
  deps: ProgramsSchedulerDependencies,
  event: {
    eventType: string;
    targetUserId: string;
    resourceType: string;
    resourceId: string;
    actorUserId?: string;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  const response = await deps.requestFn(`${deps.notificationServiceBase}/internal/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventId: `event_${randomUUID()}`,
      eventType: event.eventType,
      occurredAt: new Date().toISOString(),
      actorUserId: event.actorUserId,
      targetUserId: event.targetUserId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      payload: event.payload
    })
  });
  if (response.statusCode >= 400) {
    const detail = await response.body.text();
    throw new Error(`notification_failed:${response.statusCode}:${detail}`);
  }
}

export async function runProgramsSchedulerJob(
  deps: ProgramsSchedulerDependencies,
  job: ProgramsSchedulerJobName,
  config: {
    limit?: number;
    ageMinutes?: number;
    horizonMinutes?: number;
    lookbackMinutes?: number;
  } = {}
): Promise<ProgramsSchedulerJobResult> {
  const result: ProgramsSchedulerJobResult = {
    job,
    scanned: 0,
    processed: 0,
    skipped: 0,
    failed: 0,
    errors: []
  };

  if (job === "application_sla_reminder") {
    const candidates = await deps.repository.listApplicationReminderCandidates(
      config.ageMinutes ?? 24 * 60,
      config.limit ?? 100
    );
    result.scanned = candidates.length;
    const notificationQueue: Array<{
      candidate: (typeof candidates)[number];
      event: {
        eventType: string;
        targetUserId: string;
        resourceType: string;
        resourceId: string;
        payload: Record<string, unknown>;
      };
    }> = [];
    for (const candidate of candidates) {
      try {
        const sent = await deps.repository.hasApplicationReminderBeenSent(
          candidate.programId,
          candidate.applicationId
        );
        if (sent) {
          result.skipped += 1;
          continue;
        }
        notificationQueue.push({
          candidate,
          event: {
            eventType: "program_application_sla_reminder",
            targetUserId: candidate.userId,
            resourceType: "program_application",
            resourceId: candidate.applicationId,
            payload: {
              programId: candidate.programId,
              status: candidate.status,
              applicationCreatedAt: candidate.applicationCreatedAt
            }
          }
        });
      } catch (error) {
        result.failed += 1;
        result.errors.push(String(error));
      }
    }

    for (const batch of chunkArray(notificationQueue, 10)) {
      const outcomes = await Promise.allSettled(batch.map(({ event }) => publishNotification(deps, event)));
      for (let i = 0; i < batch.length; i++) {
        const candidate = batch[i]!.candidate;
        const outcome = outcomes[i];
        if (outcome?.status === "fulfilled") {
          try {
            await deps.repository.markApplicationReminderSent(candidate.programId, candidate.applicationId);
            result.processed += 1;
          } catch (error) {
            result.failed += 1;
            result.errors.push(String(error));
          }
        } else {
          result.failed += 1;
          result.errors.push(String(outcome?.reason));
        }
      }
    }

    return result;
  }

  if (job === "session_reminder") {
    const lookbackMinutes = config.lookbackMinutes ?? 15;
    const candidates = await deps.repository.listSessionReminderCandidates(
      config.horizonMinutes ?? 24 * 60,
      lookbackMinutes,
      config.limit ?? 250
    );
    result.scanned = candidates.length;

    const now = Date.now();
    const notificationQueue: Array<{
      candidate: (typeof candidates)[number];
      event: {
        eventType: string;
        targetUserId: string;
        resourceType: string;
        resourceId: string;
        payload: Record<string, unknown>;
      };
    }> = [];
    for (const candidate of candidates) {
      const startsAtMs = new Date(candidate.startsAt).getTime();
      const minutesUntil = (startsAtMs - now) / 60000;
      if (
        minutesUntil > candidate.reminderOffsetMinutes ||
        minutesUntil < candidate.reminderOffsetMinutes - lookbackMinutes
      ) {
        result.skipped += 1;
        continue;
      }

      try {
        const sent = await deps.repository.hasSessionReminderBeenSent(
          candidate.programId,
          candidate.sessionId,
          candidate.userId,
          candidate.reminderOffsetMinutes
        );
        if (sent) {
          result.skipped += 1;
          continue;
        }
        notificationQueue.push({
          candidate,
          event: {
            eventType: "program_session_reminder",
            targetUserId: candidate.userId,
            resourceType: "program_session",
            resourceId: candidate.sessionId,
            payload: {
              programId: candidate.programId,
              startsAt: candidate.startsAt,
              provider: candidate.provider,
              meetingUrl: candidate.meetingUrl,
              reminderOffsetMinutes: candidate.reminderOffsetMinutes
            }
          }
        });
      } catch (error) {
        result.failed += 1;
        result.errors.push(String(error));
      }
    }

    for (const batch of chunkArray(notificationQueue, 10)) {
      const outcomes = await Promise.allSettled(batch.map(({ event }) => publishNotification(deps, event)));
      for (let i = 0; i < batch.length; i++) {
        const candidate = batch[i]!.candidate;
        const outcome = outcomes[i];
        if (outcome?.status === "fulfilled") {
          try {
            await deps.repository.markSessionReminderSent(
              candidate.programId,
              candidate.sessionId,
              candidate.userId,
              candidate.reminderOffsetMinutes
            );
            result.processed += 1;
          } catch (error) {
            result.failed += 1;
            result.errors.push(String(error));
          }
        } else {
          result.failed += 1;
          result.errors.push(String(outcome?.reason));
        }
      }
    }

    return result;
  }

  if (job === "cohort_transition") {
    const transitioned = await deps.repository.runCohortTransitionJob();
    result.scanned = transitioned;
    result.processed = transitioned;
    return result;
  }

  if (job === "kpi_aggregation") {
    const programs = await deps.repository.listPrograms();
    result.scanned = programs.length;
    const snapshotDate = new Date().toISOString().slice(0, 10);
    for (const program of programs) {
      const analytics = await deps.repository.getProgramAnalytics(program.id);
      if (!analytics) {
        result.skipped += 1;
        continue;
      }
      await deps.repository.upsertProgramKpiSnapshot(program.id, snapshotDate, analytics as Record<string, unknown>);
      result.processed += 1;
    }
    return result;
  }

  while (true) {
    const nextJob = await deps.repository.claimNextProgramCrmSyncJob();
    if (!nextJob) {
      break;
    }
    result.scanned += 1;
    try {
      await publishNotification(deps, {
        eventType: "program_crm_sync_requested",
        targetUserId: nextJob.triggeredByUserId,
        resourceType: "program_crm_job",
        resourceId: nextJob.id,
        payload: {
          programId: nextJob.programId,
          reason: nextJob.reason,
          payload: nextJob.payload,
          attempts: nextJob.attempts,
          maxAttempts: nextJob.maxAttempts
        }
      });
      await deps.repository.completeProgramCrmSyncJob(nextJob.id);
      result.processed += 1;
    } catch (error) {
      await deps.repository.failProgramCrmSyncJob(nextJob.id, String(error));
      result.failed += 1;
      result.errors.push(String(error));
    }
  }
  return result;
}

export function startProgramsScheduler(
  deps: ProgramsSchedulerDependencies,
  options: {
    intervalMs?: number;
    enabled?: boolean;
  } = {}
): () => void {
  const enabled = options.enabled ?? true;
  if (!enabled) {
    return () => undefined;
  }

  const intervalMs = options.intervalMs ?? 60_000;
  let inFlight = false;

  const tick = async (): Promise<void> => {
    if (inFlight) {
      return;
    }
    inFlight = true;
    try {
      const jobs: ProgramsSchedulerJobName[] = [
        "application_sla_reminder",
        "session_reminder",
        "crm_sync_dispatcher"
      ];
      if (new Date().getUTCMinutes() % 30 === 0) {
        jobs.push("cohort_transition", "kpi_aggregation");
      }
      const results = await Promise.allSettled(
        jobs.map((job) => runProgramsSchedulerJob(deps, job))
      );
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i]!;
        const result = results[i];
        if (result?.status === "fulfilled") {
          const outcome = result.value;
          deps.logger?.info(
            {
              schedulerJob: outcome.job,
              scanned: outcome.scanned,
              processed: outcome.processed,
              failed: outcome.failed
            },
            "program scheduler tick complete"
          );
        } else {
          deps.logger?.error(
            { schedulerJob: job, error: result?.reason },
            "program scheduler job failed"
          );
        }
      }
    } catch (error) {
      deps.logger?.error({ error }, "program scheduler tick failed");
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  void tick();

  return () => {
    clearInterval(timer);
  };
}
