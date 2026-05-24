import assert from "node:assert/strict";
import test from "node:test";
import { request } from "undici";
import { buildServer } from "../index.js";

type RequestResult = Awaited<ReturnType<typeof request>>;

function jsonResponse(payload: unknown, statusCode = 200): RequestResult {
  return {
    statusCode,
    body: {
      json: async () => payload,
      text: async () => JSON.stringify(payload)
    }
  } as RequestResult;
}

test("POST /api/v1/career-imports proxies CSV preview with writer auth", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const bodies: string[] = [];
  const server = await buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({ user: { id: "writer_01", role: "writer" } });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      bodies.push(typeof options?.body === "string" ? options.body : "");
      return jsonResponse({ batch: { id: "import_01" }, rows: [] }, 201);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    submissionTrackingBase: "http://submission-svc"
  });
  t.after(async () => { await server.close(); });

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/career-imports?filename=career.csv",
    headers: { authorization: "Bearer sess_1", "content-type": "text/csv" },
    payload: "project_title,competition_name,year,status\nPilot,AFF,2023,finalist"
  });

  assert.equal(response.statusCode, 201);
  assert.equal(urls[0], "http://submission-svc/internal/career-imports?filename=career.csv");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
  assert.equal(headers[0]?.["content-type"], "text/csv");
  assert.match(bodies[0] ?? "", /Pilot,AFF/);
});

test("POST /api/v1/career-imports/:batchId/commit proxies accepted rows and recomputes ranking", async (t) => {
  const urls: string[] = [];
  const bodies: string[] = [];
  const server = await buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({ user: { id: "writer_01", role: "writer" } });
      }
      urls.push(urlStr);
      bodies.push(typeof options?.body === "string" ? options.body : "");
      if (urlStr.includes("/commit")) return jsonResponse({ batchId: "import_01", committed: 2, skipped: 0 });
      return jsonResponse({ ok: true });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    submissionTrackingBase: "http://submission-svc",
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => { await server.close(); });

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/career-imports/import_01/commit",
    headers: { authorization: "Bearer sess_1" },
    payload: { batchId: "import_01", acceptedRowIndices: [0, 1] }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://submission-svc/internal/career-imports/import_01/commit");
  assert.deepEqual(JSON.parse(bodies[0] ?? "{}"), { batchId: "import_01", acceptedRowIndices: [0, 1] });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(urls.some((url) => url === "http://ranking-svc/internal/recompute/incremental"));
});

test("career import routes require writer authentication", async (t) => {
  const server = await buildServer({
    logger: false,
    requestFn: (async () => jsonResponse({ error: "unauthorized" }, 401)) as typeof request
  });
  t.after(async () => { await server.close(); });

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/career-imports",
    headers: { "content-type": "text/csv" },
    payload: "project_title,competition_name,year,status\nPilot,AFF,2023,finalist"
  });

  assert.equal(response.statusCode, 403);
});
