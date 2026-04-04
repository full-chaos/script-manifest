import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/toast";
import SearchAdminPage from "./page";

describe("SearchAdminPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          backend: "postgres_fts",
          searchHealth: "ready",
          documentCount: 12,
          indexSizeBytes: 1024,
          lastSyncAt: null,
          notes: []
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
  });

  it("renders search status", async () => {
    render(
      <ToastProvider>
        <SearchAdminPage />
      </ToastProvider>
    );

    expect(await screen.findByText("Competition Search")).toBeInTheDocument();
    expect(screen.getByText("Search Health")).toBeInTheDocument();
    expect(screen.getByText("Indexed Competitions")).toBeInTheDocument();
  });
});
