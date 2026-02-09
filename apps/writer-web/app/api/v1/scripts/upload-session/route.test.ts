import { describe, expect, it, vi } from "vitest";

vi.mock("../../_proxy", () => ({
  proxyRequest: vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 }))
}));

import { POST } from "./route";
import { proxyRequest } from "../../_proxy";

describe("upload-session route", () => {
  it("proxies to gateway upload-session endpoint", async () => {
    const request = new Request("http://localhost/api/v1/scripts/upload-session", {
      method: "POST",
      body: JSON.stringify({ scriptId: "script_1" }),
      headers: { "content-type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/scripts/upload-session");
  });
});
