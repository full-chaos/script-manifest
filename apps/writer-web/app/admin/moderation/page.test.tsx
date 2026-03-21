import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/toast";
import AdminModerationPage from "./page";

describe("AdminModerationPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ reports: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
  });

  it("renders moderation queue empty state", async () => {
    render(
      <ToastProvider>
        <AdminModerationPage />
      </ToastProvider>
    );

    expect(await screen.findByText("Content Moderation Queue")).toBeInTheDocument();
    expect(screen.getByText("No reports found")).toBeInTheDocument();
  });
});
