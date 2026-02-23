import { describe, expect, it, vi } from "vitest";

vi.mock("../../_proxy", () => ({
  proxyRequest: vi.fn(async () =>
    new Response(JSON.stringify({ listings: [] }), { status: 200 })
  )
}));

import { GET, POST } from "./route";
import { proxyRequest } from "../../_proxy";

describe("feedback listings route", () => {
  describe("GET", () => {
    it("proxies GET to gateway feedback listings endpoint", async () => {
      const request = new Request("http://localhost/api/v1/feedback/listings", {
        method: "GET",
        headers: { authorization: "Bearer sess_abc123" }
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/feedback/listings");
    });

    it("forwards query parameters for filtering", async () => {
      const request = new Request(
        "http://localhost/api/v1/feedback/listings?status=open&limit=20",
        {
          method: "GET",
          headers: { authorization: "Bearer sess_abc123" }
        }
      );

      await GET(request);

      expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/feedback/listings");
    });

    it("returns 401 when not authenticated", async () => {
      vi.mocked(proxyRequest).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
      );

      const request = new Request("http://localhost/api/v1/feedback/listings", {
        method: "GET"
      });

      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it("returns 502 when gateway is unavailable", async () => {
      vi.mocked(proxyRequest).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "api_gateway_unavailable" }), { status: 502 })
      );

      const request = new Request("http://localhost/api/v1/feedback/listings", {
        method: "GET",
        headers: { authorization: "Bearer sess_abc123" }
      });

      const response = await GET(request);

      expect(response.status).toBe(502);
    });
  });

  describe("POST", () => {
    it("proxies POST to gateway feedback listings endpoint", async () => {
      vi.mocked(proxyRequest).mockResolvedValueOnce(
        new Response(JSON.stringify({ listingId: "listing_1" }), { status: 201 })
      );

      const request = new Request("http://localhost/api/v1/feedback/listings", {
        method: "POST",
        body: JSON.stringify({
          scriptId: "script_1",
          turnaroundDays: 7,
          tokenReward: 10
        }),
        headers: {
          "content-type": "application/json",
          authorization: "Bearer sess_abc123"
        }
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/feedback/listings");
    });

    it("returns 422 when listing data is invalid", async () => {
      vi.mocked(proxyRequest).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "validation_failed" }), { status: 422 })
      );

      const request = new Request("http://localhost/api/v1/feedback/listings", {
        method: "POST",
        body: JSON.stringify({ scriptId: "" }),
        headers: {
          "content-type": "application/json",
          authorization: "Bearer sess_abc123"
        }
      });

      const response = await POST(request);

      expect(response.status).toBe(422);
    });
  });
});
