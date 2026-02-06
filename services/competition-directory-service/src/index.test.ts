import assert from "node:assert/strict";
import test from "node:test";
import { buildServer } from "./index.js";
import { request } from "undici";

type RequestResult = Awaited<ReturnType<typeof request>>;

function textResponse(payload: unknown, statusCode = 200): RequestResult {
  return {
    statusCode,
    body: {
      text: async () => JSON.stringify(payload),
      json: async () => payload
    }
  } as RequestResult;
}

test("competition directory filters seeded competitions", async (t) => {
  const server = buildServer({ logger: false, requestFn: (async () => textResponse({})) as typeof request });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({ method: "GET", url: "/internal/competitions?genre=drama" });
  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.competitions.length, 1);
});

test("competition directory upsert indexes competition", async (t) => {
  const calls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      calls.push(String(url));
      return textResponse({ result: "ok" }, 201);
    }) as typeof request
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/internal/competitions",
    payload: {
      id: "comp_200",
      title: "Pilot Lab",
      description: "TV contest",
      format: "tv",
      genre: "drama",
      feeUsd: 55,
      deadline: "2026-09-01T00:00:00Z"
    }
  });

  assert.equal(response.statusCode, 201);
  const payload = response.json();
  assert.equal(payload.indexed, true);
  assert.match(calls[0] ?? "", /\/internal\/index\/competition$/);
});

test("competition deadline reminder publishes notification event", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return textResponse({ accepted: true }, 202);
    }) as typeof request,
    notificationServiceBase: "http://notification-service"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/internal/competitions/comp_001/deadline-reminders",
    payload: {
      targetUserId: "writer_01",
      deadlineAt: "2026-05-01T23:59:59Z"
    }
  });

  assert.equal(response.statusCode, 202);
  assert.match(urls[0] ?? "", /notification-service\/internal\/events$/);
});
