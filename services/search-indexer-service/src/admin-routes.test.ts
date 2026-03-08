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

test("GET /internal/admin/search/status returns index status", async (t) => {
  const calls: string[] = [];
  const server = buildServer({
    logger: false,
    openSearchIndex: "test_index_v1",
    requestFn: (async (url, options) => {
      const normalized = `${String(options?.method ?? "GET")} ${String(url)}`;
      calls.push(normalized);

      if (String(url).includes("/_cluster/health")) {
        return response({ status: "green", cluster_name: "test" });
      }

      if (String(url).includes("/_stats")) {
        return response({
          _all: {
            primaries: {
              docs: { count: 42 },
              store: { size_in_bytes: 1024000 }
            }
          }
        });
      }

      return response({});
    }) as typeof request
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/internal/admin/search/status"
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.payload) as {
    clusterHealth: string;
    indexName: string;
    documentCount: number;
    indexSizeBytes: number;
  };
  assert.equal(body.clusterHealth, "green");
  assert.equal(body.indexName, "test_index_v1");
  assert.equal(body.documentCount, 42);
  assert.equal(body.indexSizeBytes, 1024000);
  assert.ok(calls.some(c => c.includes("/_cluster/health")));
  assert.ok(calls.some(c => c.includes("/_stats")));
});

test("GET /internal/admin/search/status returns 502 when OpenSearch is down", async (t) => {
  const server = buildServer({
    logger: false,
    requestFn: (async () => {
      throw new Error("Connection refused");
    }) as typeof request
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/internal/admin/search/status"
  });

  assert.equal(res.statusCode, 502);
  const body = JSON.parse(res.payload) as { error: string };
  assert.equal(body.error, "opensearch_unavailable");
});

test("POST /internal/admin/search/reindex returns 202 with job info", async (t) => {
  const calls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      calls.push(`${String(options?.method ?? "GET")} ${String(url)}`);

      if (String(options?.method) === "DELETE") {
        return response({ acknowledged: true });
      }
      if (String(options?.method) === "HEAD") {
        return response({}, 404);
      }
      return response({ acknowledged: true });
    }) as typeof request
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/internal/admin/search/reindex"
  });

  assert.equal(res.statusCode, 202);
  const body = JSON.parse(res.payload) as {
    jobId: string;
    type: string;
    status: string;
    startedAt: string;
  };
  assert.ok(body.jobId.startsWith("reindex_"));
  assert.equal(body.type, "all");
  assert.equal(body.status, "started");
  assert.ok(body.startedAt);
});

test("POST /internal/admin/search/reindex/:type reindexes competitions", async (t) => {
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      if (String(options?.method) === "DELETE") {
        return response({ acknowledged: true });
      }
      if (String(options?.method) === "HEAD") {
        return response({}, 404);
      }
      return response({ acknowledged: true });
    }) as typeof request
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/internal/admin/search/reindex/competitions"
  });

  assert.equal(res.statusCode, 202);
  const body = JSON.parse(res.payload) as { type: string; status: string };
  assert.equal(body.type, "competitions");
  assert.equal(body.status, "started");
});

test("POST /internal/admin/search/reindex/:type rejects unsupported type", async (t) => {
  const server = buildServer({
    logger: false,
    requestFn: (async () => response({})) as typeof request
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/internal/admin/search/reindex/invalid_type"
  });

  assert.equal(res.statusCode, 400);
  const body = JSON.parse(res.payload) as { error: string };
  assert.equal(body.error, "unsupported_reindex_type");
});
