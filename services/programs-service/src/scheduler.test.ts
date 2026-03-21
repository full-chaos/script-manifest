import assert from "node:assert/strict";
import test from "node:test";
import { runProgramsSchedulerJob, startProgramsScheduler } from "./scheduler.js";
import type { ProgramsRepository } from "./repository.js";
import type { ProgramsSchedulerDependencies } from "./scheduler.js";

type RequestFn = ProgramsSchedulerDependencies["requestFn"];

const okRequest: RequestFn = async () => {
  return {
    statusCode: 202,
    body: {
      text: async () => ""
    }
  } as unknown as Awaited<ReturnType<RequestFn>>;
};

test("runProgramsSchedulerJob session_reminder skips out-of-window candidates", async (t) => {
  t.mock.method(Date, "now", () => new Date("2026-03-01T12:00:00.000Z").getTime());

  const sent: string[] = [];
  const repository = {
    listSessionReminderCandidates: async () => [
      {
        programId: "program_1",
        sessionId: "session_1",
        userId: "writer_1",
        startsAt: "2026-03-01T14:00:00.000Z",
        provider: "zoom",
        meetingUrl: "https://example.test",
        reminderOffsetMinutes: 30
      }
    ],
    hasSessionReminderBeenSent: async () => false,
    markSessionReminderSent: async (_programId: string, _sessionId: string, userId: string) => {
      sent.push(userId);
    }
  } as unknown as ProgramsRepository;

  const result = await runProgramsSchedulerJob(
    {
      repository,
      requestFn: okRequest,
      notificationServiceBase: "http://notification"
    },
    "session_reminder",
    { lookbackMinutes: 10, horizonMinutes: 240, limit: 10 }
  );

  assert.equal(result.scanned, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.processed, 0);
  assert.deepEqual(sent, []);
});

test("startProgramsScheduler schedules tick and runs default jobs", async (t) => {
  let intervalCallback: (() => void) | undefined;
  const logs: string[] = [];

  t.mock.method(globalThis, "setInterval", ((callback: TimerHandler) => {
    if (typeof callback === "function") {
      intervalCallback = callback;
    }
    return 1 as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval);
  t.mock.method(globalThis, "clearInterval", (() => undefined) as typeof clearInterval);

  const repository = {
    listApplicationReminderCandidates: async () => [],
    listSessionReminderCandidates: async () => [],
    claimNextProgramCrmSyncJob: async () => null
  } as unknown as ProgramsRepository;

  const stop = startProgramsScheduler({
    repository,
    requestFn: okRequest,
    notificationServiceBase: "http://notification",
    logger: {
      info: (_payload, message) => logs.push(message),
      error: () => undefined
    }
  }, { intervalMs: 50, enabled: true });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(intervalCallback);
  if (intervalCallback) {
    intervalCallback();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));

  stop();
  assert.ok(logs.some((message) => message === "program scheduler tick complete"));
});
