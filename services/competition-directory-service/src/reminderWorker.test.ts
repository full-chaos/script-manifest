import assert from "node:assert/strict";
import test from "node:test";
import { request } from "undici";
import type { NotificationEventEnvelope } from "@script-manifest/contracts";
import type { CompetitionReminderDispatchRepository } from "./repository.js";
import { dispatchDueCompetitionReminders } from "./reminderWorker.js";

type RequestResult = Awaited<ReturnType<typeof request>>;

function textResponse(payload: unknown, statusCode = 202): RequestResult {
  return {
    statusCode,
    body: {
      text: async () => JSON.stringify(payload),
      json: async () => payload
    }
  } as RequestResult;
}

class MemoryReminderRepository implements CompetitionReminderDispatchRepository {
  readonly dispatchedIds: string[] = [];
  readonly rows = [{
    id: "dispatch_1",
    writerId: "writer_1",
    competitionId: "comp_1",
    fireAt: new Date("2026-01-01T00:00:00.000Z"),
    competitionTitle: "Future Lab",
    competitionDeadline: "2026-01-15T00:00:00.000Z"
  }];

  async listDueReminderDispatches(): Promise<typeof this.rows> {
    return this.rows.filter((row) => !this.dispatchedIds.includes(row.id));
  }

  async markReminderDispatched(id: string, notificationEventId: string): Promise<void> {
    assert.equal(notificationEventId.length > 0, true);
    this.dispatchedIds.push(id);
  }
}

test("dispatchDueCompetitionReminders posts competition_reminder events once", async () => {
  const repository = new MemoryReminderRepository();
  const events: NotificationEventEnvelope[] = [];
  const requestFn = (async (_url, options) => {
    const body = typeof options?.body === "string" ? JSON.parse(options.body) as NotificationEventEnvelope : null;
    if (body) events.push(body);
    return textResponse({ accepted: true }, 202);
  }) as typeof request;

  const first = await dispatchDueCompetitionReminders({
    repository,
    requestFn,
    notificationServiceBase: "http://notification-service"
  });
  const second = await dispatchDueCompetitionReminders({
    repository,
    requestFn,
    notificationServiceBase: "http://notification-service"
  });

  assert.equal(first.dispatched, 1);
  assert.equal(second.dispatched, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, "competition_reminder");
  assert.equal(events[0]?.targetUserId, "writer_1");
});
