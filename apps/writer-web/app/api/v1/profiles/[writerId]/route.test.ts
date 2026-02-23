import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("../../_proxy", () => ({
  proxyRequest: vi.fn(async () =>
    NextResponse.json(
      { userId: "user_1", displayName: "Jane Writer" },
      { status: 200 }
    )
  )
}));

import { GET, PUT } from "./route";
import { proxyRequest } from "../../_proxy";

describe("profiles [writerId] route", () => {
  describe("GET", () => {
    it("proxies GET to the gateway profile endpoint with writerId", async () => {
      const request = new Request("http://localhost/api/v1/profiles/user_1", {
        method: "GET",
        headers: { authorization: "Bearer sess_abc123" }
      });
      const context = { params: Promise.resolve({ writerId: "user_1" }) };

      const response = await GET(request, context);

      expect(response.status).toBe(200);
      expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/profiles/user_1");
    });

    it("URL-encodes the writerId in the upstream path", async () => {
      const request = new Request("http://localhost/api/v1/profiles/user%40special", {
        method: "GET"
      });
      const context = { params: Promise.resolve({ writerId: "user@special" }) };

      await GET(request, context);

      expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(
        request,
        "/api/v1/profiles/user%40special"
      );
    });

    it("returns 404 when writer is not found", async () => {
      vi.mocked(proxyRequest).mockResolvedValueOnce(
        NextResponse.json({ error: "profile_not_found" }, { status: 404 })
      );

      const request = new Request("http://localhost/api/v1/profiles/unknown_user", {
        method: "GET"
      });
      const context = { params: Promise.resolve({ writerId: "unknown_user" }) };

      const response = await GET(request, context);

      expect(response.status).toBe(404);
    });

    it("returns 502 when gateway is unavailable", async () => {
      vi.mocked(proxyRequest).mockResolvedValueOnce(
        NextResponse.json({ error: "api_gateway_unavailable" }, { status: 502 })
      );

      const request = new Request("http://localhost/api/v1/profiles/user_1", {
        method: "GET"
      });
      const context = { params: Promise.resolve({ writerId: "user_1" }) };

      const response = await GET(request, context);

      expect(response.status).toBe(502);
    });
  });

  describe("PUT", () => {
    it("proxies PUT to the gateway profile endpoint with writerId", async () => {
      vi.mocked(proxyRequest).mockResolvedValueOnce(
        NextResponse.json(
          { userId: "user_1", displayName: "Jane Updated" },
          { status: 200 }
        )
      );

      const request = new Request("http://localhost/api/v1/profiles/user_1", {
        method: "PUT",
        body: JSON.stringify({ displayName: "Jane Updated", bio: "Updated bio" }),
        headers: {
          "content-type": "application/json",
          authorization: "Bearer sess_abc123"
        }
      });
      const context = { params: Promise.resolve({ writerId: "user_1" }) };

      const response = await PUT(request, context);

      expect(response.status).toBe(200);
      expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/profiles/user_1");
    });

    it("returns 403 when updating another user's profile", async () => {
      vi.mocked(proxyRequest).mockResolvedValueOnce(
        NextResponse.json({ error: "forbidden" }, { status: 403 })
      );

      const request = new Request("http://localhost/api/v1/profiles/other_user", {
        method: "PUT",
        body: JSON.stringify({ displayName: "Malicious Update" }),
        headers: {
          "content-type": "application/json",
          authorization: "Bearer sess_abc123"
        }
      });
      const context = { params: Promise.resolve({ writerId: "other_user" }) };

      const response = await PUT(request, context);

      expect(response.status).toBe(403);
    });
  });
});
