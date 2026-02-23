import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("../_proxy", () => ({
  proxyRequest: vi.fn(async () =>
    NextResponse.json({ submissions: [] }, { status: 200 })
  )
}));

import { GET, POST } from "./route";
import { proxyRequest } from "../_proxy";

describe("submissions route", () => {
  describe("GET", () => {
    it("proxies GET to gateway submissions endpoint", async () => {
      const request = new Request("http://localhost/api/v1/submissions", {
        method: "GET",
        headers: { authorization: "Bearer sess_abc123" }
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/submissions");
    });

    it("forwards query parameters for filtering submissions", async () => {
      const request = new Request(
        "http://localhost/api/v1/submissions?competitionId=comp_1&status=submitted",
        {
          method: "GET",
          headers: { authorization: "Bearer sess_abc123" }
        }
      );

      await GET(request);

      expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/submissions");
    });

    it("returns 401 when not authenticated", async () => {
      vi.mocked(proxyRequest).mockResolvedValueOnce(
        NextResponse.json({ error: "unauthorized" }, { status: 401 })
      );

      const request = new Request("http://localhost/api/v1/submissions", {
        method: "GET"
      });

      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it("returns 502 when gateway is unavailable", async () => {
      vi.mocked(proxyRequest).mockResolvedValueOnce(
        NextResponse.json({ error: "api_gateway_unavailable" }, { status: 502 })
      );

      const request = new Request("http://localhost/api/v1/submissions", {
        method: "GET",
        headers: { authorization: "Bearer sess_abc123" }
      });

      const response = await GET(request);

      expect(response.status).toBe(502);
    });
  });

  describe("POST", () => {
    it("proxies POST to gateway submissions endpoint", async () => {
      vi.mocked(proxyRequest).mockResolvedValueOnce(
        NextResponse.json({ submissionId: "sub_1" }, { status: 201 })
      );

      const request = new Request("http://localhost/api/v1/submissions", {
        method: "POST",
        body: JSON.stringify({
          competitionId: "comp_1",
          scriptId: "script_1",
          ownerUserId: "user_1"
        }),
        headers: {
          "content-type": "application/json",
          authorization: "Bearer sess_abc123"
        }
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/submissions");
    });

    it("returns 409 when already submitted to this competition", async () => {
      vi.mocked(proxyRequest).mockResolvedValueOnce(
        NextResponse.json({ error: "already_submitted" }, { status: 409 })
      );

      const request = new Request("http://localhost/api/v1/submissions", {
        method: "POST",
        body: JSON.stringify({ competitionId: "comp_1", scriptId: "script_1" }),
        headers: {
          "content-type": "application/json",
          authorization: "Bearer sess_abc123"
        }
      });

      const response = await POST(request);

      expect(response.status).toBe(409);
    });

    it("returns 422 when submission data is invalid", async () => {
      vi.mocked(proxyRequest).mockResolvedValueOnce(
        NextResponse.json({ error: "validation_failed" }, { status: 422 })
      );

      const request = new Request("http://localhost/api/v1/submissions", {
        method: "POST",
        body: JSON.stringify({}),
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
