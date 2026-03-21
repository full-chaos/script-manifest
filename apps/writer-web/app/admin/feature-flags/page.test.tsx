import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/toast";
import FeatureFlagsPage from "./page";

describe("FeatureFlagsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ flags: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
  });

  it("renders feature flags empty state", async () => {
    render(
      <ToastProvider>
        <FeatureFlagsPage />
      </ToastProvider>
    );

    expect(await screen.findByText("Feature Flags")).toBeInTheDocument();
    expect(screen.getByText("No feature flags")).toBeInTheDocument();
  });
});
