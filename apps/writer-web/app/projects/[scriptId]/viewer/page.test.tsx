import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScriptViewerPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ scriptId: "script_123" })
}));

describe("ScriptViewerPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          scriptId: "script_123",
          filename: "Draft.pdf",
          viewerPath: "s3://bucket/object",
          viewerUrl: "https://example.com/viewer.pdf",
          contentType: "application/pdf",
          expiresAt: "2026-03-01T00:00:00.000Z",
          access: { canView: true }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
  });

  it("renders viewer payload details", async () => {
    render(<ScriptViewerPage />);

    expect(await screen.findByText("Script Viewer Scaffold")).toBeInTheDocument();
    expect(screen.getByText("Draft.pdf")).toBeInTheDocument();
  });
});
