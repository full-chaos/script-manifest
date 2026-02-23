import { describe, expect, it, vi } from "vitest";

vi.mock("../../_proxy", () => ({
  proxyRequest: vi.fn(async () =>
    new Response(JSON.stringify({ providers: [] }), { status: 200 })
  )
}));

import { GET, POST } from "./route";
import { proxyRequest } from "../../_proxy";

describe("coverage providers route", () => {
  describe("GET", () => {
    it("proxies GET to gateway coverage providers endpoint", async () => {
      const request = new Request("http://localhost/api/v1/coverage/providers", {
        method: "GET",
        headers: { authorization: "Bearer sess_abc123" }
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/coverage/providers");
    });

    it("forwards query parameters for filtering", async () => {
      const request = new Request(
        "http://localhost/api/v1/coverage/providers?genre=thriller&limit=10",
        {
          method: "GET",
          headers: { authorization: "Bearer sess_abc123" }
        }
      );

      await GET(request);

      expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/coverage/providers");
    });

    it("returns upstream error status on failure", async () => {
      vi.mocked(proxyRequest).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "api_gateway_unavailable" }), { status: 502 })
      );

      const request = new Request("http://localhost/api/v1/coverage/providers", {
        method: "GET"
      });

      const response = await GET(request);

      expect(response.status).toBe(502);
    });
  });

  describe("POST", () => {
    it("proxies POST to gateway coverage providers endpoint", async () => {
      vi.mocked(proxyRequest).mockResolvedValueOnce(
        new Response(JSON.stringify({ providerId: "prov_1" }), { status: 201 })
      );

      const request = new Request("http://localhost/api/v1/coverage/providers", {
        method: "POST",
        body: JSON.stringify({ displayName: "Coverage Pro", bio: "Expert coverage" }),
        headers: {
          "content-type": "application/json",
          authorization: "Bearer sess_abc123"
        }
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/coverage/providers");
    });

    it("returns 409 when provider already exists", async () => {
      vi.mocked(proxyRequest).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "provider_already_exists" }), { status: 409 })
      );

      const request = new Request("http://localhost/api/v1/coverage/providers", {
        method: "POST",
        body: JSON.stringify({ displayName: "Duplicate" }),
        headers: {
          "content-type": "application/json",
          authorization: "Bearer sess_abc123"
        }
      });

      const response = await POST(request);

      expect(response.status).toBe(409);
    });
  });
});
