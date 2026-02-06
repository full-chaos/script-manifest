import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "./route";

test("viewer route proxies and validates payload", async (t) => {
  const originalFetch = globalThis.fetch;
  process.env.SCRIPT_STORAGE_SERVICE_URL = "http://script-storage";

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        scriptId: "script_demo_01",
        bucket: "scripts",
        objectKey: "writer_01/script_demo_01/latest.pdf",
        filename: "demo-script.pdf",
        contentType: "application/pdf",
        viewerUrl: "http://localhost:9000/scripts/writer_01/script_demo_01/latest.pdf",
        viewerPath: "/scripts/writer_01/script_demo_01/latest.pdf",
        expiresAt: "2026-02-06T12:00:00Z",
        access: {
          canView: true,
          isOwner: true,
          requiresRequest: false
        }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await GET(new Request("http://localhost/api/scripts/script_demo_01/viewer"), {
    params: Promise.resolve({ scriptId: "script_demo_01" })
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.scriptId, "script_demo_01");
});

test("viewer route returns 502 when upstream is unavailable", async (t) => {
  const originalFetch = globalThis.fetch;
  process.env.SCRIPT_STORAGE_SERVICE_URL = "http://script-storage";

  globalThis.fetch = (async () => {
    throw new Error("connection refused");
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await GET(new Request("http://localhost/api/scripts/script_demo_01/viewer"), {
    params: Promise.resolve({ scriptId: "script_demo_01" })
  });

  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "script_storage_service_unavailable");
});
