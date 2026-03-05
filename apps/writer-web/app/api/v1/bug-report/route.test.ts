import { describe, expect, it, vi, beforeEach } from "vitest";

const mockCreateIssue = vi.fn();

vi.mock("@linear/sdk", () => ({
  LinearClient: vi.fn(() => ({
    createIssue: mockCreateIssue
  }))
}));

import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/bug-report", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" }
  });
}

const validPayload = {
  title: "Button is broken",
  description: "Clicking submit does nothing",
  priority: 2,
  pageUrl: "http://localhost:3000/profile",
  userAgent: "Mozilla/5.0"
};

describe("bug-report route", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mockCreateIssue.mockReset();
  });

  it("returns 503 when LINEAR_API_KEY is not set", async () => {
    vi.stubEnv("LINEAR_API_KEY", "");
    vi.stubEnv("LINEAR_TEAM_ID", "team-uuid");

    const response = await POST(makeRequest(validPayload));

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe("bug_reporting_not_configured");
  });

  it("returns 503 when LINEAR_TEAM_ID is not set", async () => {
    vi.stubEnv("LINEAR_API_KEY", "lin_api_test");
    vi.stubEnv("LINEAR_TEAM_ID", "");

    const response = await POST(makeRequest(validPayload));

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe("bug_reporting_not_configured");
  });

  it("returns 400 for invalid JSON body", async () => {
    vi.stubEnv("LINEAR_API_KEY", "lin_api_test");
    vi.stubEnv("LINEAR_TEAM_ID", "team-uuid");

    const request = new Request("http://localhost/api/v1/bug-report", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_json");
  });

  it("returns 400 when required fields are missing", async () => {
    vi.stubEnv("LINEAR_API_KEY", "lin_api_test");
    vi.stubEnv("LINEAR_TEAM_ID", "team-uuid");

    const response = await POST(makeRequest({ title: "" }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("validation_error");
  });

  it("returns 400 when priority is out of range", async () => {
    vi.stubEnv("LINEAR_API_KEY", "lin_api_test");
    vi.stubEnv("LINEAR_TEAM_ID", "team-uuid");

    const response = await POST(makeRequest({ ...validPayload, priority: 9 }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("validation_error");
  });

  it("creates a Linear issue and returns success", async () => {
    vi.stubEnv("LINEAR_API_KEY", "lin_api_test");
    vi.stubEnv("LINEAR_TEAM_ID", "team-uuid");

    mockCreateIssue.mockResolvedValueOnce({
      success: true,
      issue: Promise.resolve({ identifier: "CHAOS-99", url: "https://linear.app/issue/CHAOS-99" })
    });

    const response = await POST(makeRequest(validPayload));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.issueId).toBe("CHAOS-99");
    expect(body.issueUrl).toBe("https://linear.app/issue/CHAOS-99");

    expect(mockCreateIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "[Bug] Button is broken",
        teamId: "team-uuid",
        priority: 2
      })
    );
  });

  it("includes page URL and user agent in the description", async () => {
    vi.stubEnv("LINEAR_API_KEY", "lin_api_test");
    vi.stubEnv("LINEAR_TEAM_ID", "team-uuid");

    mockCreateIssue.mockResolvedValueOnce({
      success: true,
      issue: Promise.resolve({ identifier: "CHAOS-100", url: "https://linear.app/issue/CHAOS-100" })
    });

    await POST(makeRequest(validPayload));

    const call = mockCreateIssue.mock.calls[0]?.[0] as { description: string };
    expect(call.description).toContain("http://localhost:3000/profile");
    expect(call.description).toContain("Mozilla/5.0");
    expect(call.description).toContain("Clicking submit does nothing");
  });

  it("returns 502 when Linear rejects creation", async () => {
    vi.stubEnv("LINEAR_API_KEY", "lin_api_test");
    vi.stubEnv("LINEAR_TEAM_ID", "team-uuid");

    mockCreateIssue.mockResolvedValueOnce({ success: false });

    const response = await POST(makeRequest(validPayload));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe("linear_create_failed");
  });

  it("returns 502 when Linear SDK throws", async () => {
    vi.stubEnv("LINEAR_API_KEY", "lin_api_test");
    vi.stubEnv("LINEAR_TEAM_ID", "team-uuid");

    mockCreateIssue.mockRejectedValueOnce(new Error("Network timeout"));

    const response = await POST(makeRequest(validPayload));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe("linear_api_error");
    expect(body.detail).toBe("Network timeout");
  });
});
