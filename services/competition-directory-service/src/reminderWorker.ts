import { randomUUID } from "node:crypto";
import { request } from "undici";
import { NotificationEventEnvelopeSchema } from "@script-manifest/contracts";
import type { CompetitionReminderDispatchRepository } from "./repository.js";

type RequestFn = typeof request;

export type ReminderWorkerOptions = {
  repository: CompetitionReminderDispatchRepository;
  requestFn?: RequestFn;
  notificationServiceBase: string;
  limit?: number;
};

export async function dispatchDueCompetitionReminders(options: ReminderWorkerOptions): Promise<{ dispatched: number; failed: number }> {
  const requestFn = options.requestFn ?? request;
  const dueRows = await options.repository.listDueReminderDispatches(options.limit ?? 50);
  let dispatched = 0;
  let failed = 0;

  for (const row of dueRows) {
    const event = NotificationEventEnvelopeSchema.parse({
      eventId: randomUUID(),
      eventType: "competition_reminder",
      occurredAt: new Date().toISOString(),
      targetUserId: row.writerId,
      resourceType: "competition",
      resourceId: row.competitionId,
      payload: {
        competitionId: row.competitionId,
        competitionTitle: row.competitionTitle,
        deadlineAt: row.competitionDeadline,
        fireAt: row.fireAt.toISOString()
      }
    });

    try {
      const upstream = await requestFn(`${options.notificationServiceBase}/internal/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event)
      });

      if (upstream.statusCode >= 400) {
        failed += 1;
        continue;
      }

      await options.repository.markReminderDispatched(row.id, event.eventId);
      dispatched += 1;
    } catch {
      failed += 1;
    }
  }

  return { dispatched, failed };
}

export function startCompetitionReminderWorker(options: ReminderWorkerOptions & { intervalMs?: number }): NodeJS.Timeout | null {
  if (process.env.COMPETITION_REMINDER_WORKER_DISABLED === "true" || process.env.NODE_ENV === "test") {
    return null;
  }

  const intervalMs = options.intervalMs ?? Number(process.env.COMPETITION_REMINDER_WORKER_INTERVAL_MS ?? 60_000);
  const tick = () => {
    void dispatchDueCompetitionReminders(options);
  };

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  tick();
  return timer;
}
