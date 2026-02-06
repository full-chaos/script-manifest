import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("viewer route", () => {
  it("proxies and validates payload", async () => {
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

  try {
    const response = await GET(new Request("http://localhost/api/scripts/script_demo_01/viewer"), {
      params: Promise.resolve({ scriptId: "script_demo_01" })
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.scriptId).toBe("script_demo_01");
  } finally {
    globalThis.fetch = originalFetch;
  }
  });

  it("returns 502 when upstream is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  process.env.SCRIPT_STORAGE_SERVICE_URL = "http://script-storage";

  globalThis.fetch = (async () => {
    throw new Error("connection refused");
  }) as typeof fetch;

  try {
    const response = await GET(new Request("http://localhost/api/scripts/script_demo_01/viewer"), {
      params: Promise.resolve({ scriptId: "script_demo_01" })
    });

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe("script_storage_service_unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
  });
});
