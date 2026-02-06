import assert from "node:assert/strict";
import test from "node:test";
import { buildServer } from "./index.js";
import { request } from "undici";

type RequestResult = Awaited<ReturnType<typeof request>>;

function response(payload: unknown, statusCode = 200): RequestResult {
  return {
    statusCode,
    body: {
      text: async () => JSON.stringify(payload),
      json: async () => payload
    }
  } as RequestResult;
}

test("search indexer indexes single competition", async (t) => {
  const calls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const normalized = `${String(options?.method ?? "GET")} ${String(url)}`;
      calls.push(normalized);
      if (String(options?.method ?? "GET") === "HEAD") {
        return response({}, 404);
      }
      if (String(options?.method ?? "GET") === "PUT" && String(url).includes("/_doc/")) {
        return response({ result: "created" }, 201);
      }
      return response({ acknowledged: true }, 200);
    }) as typeof request
  });
  t.after(async () => {
    await server.close();
  });

  const apiResponse = await server.inject({
    method: "POST",
    url: "/internal/index/competition",
    payload: {
      id: "comp_1",
      title: "Script Cup",
      description: "desc",
      format: "feature",
      genre: "drama",
      feeUsd: 10,
      deadline: "2026-08-01T00:00:00Z"
    }
  });

  assert.equal(apiResponse.statusCode, 201);
  assert.ok(calls.some((entry) => entry.startsWith("HEAD")));
  assert.ok(calls.some((entry) => entry.includes("/_doc/comp_1")));
});

test("search indexer accepts empty bulk payload", async (t) => {
  const server = buildServer({ logger: false, requestFn: (async () => response({})) as typeof request });
  t.after(async () => {
    await server.close();
  });

  const apiResponse = await server.inject({
    method: "POST",
    url: "/internal/index/competition/bulk",
    payload: []
  });

  assert.equal(apiResponse.statusCode, 200);
  const payload = apiResponse.json();
  assert.equal(payload.indexed, 0);
});
