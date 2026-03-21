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
          clusterHealth: "green",
          indexName: "scripts",
          documentCount: 12,
          indexSizeBytes: 1024,
          lastSyncAt: null
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
  });

  it("renders search index status", async () => {
    render(
      <ToastProvider>
        <SearchAdminPage />
      </ToastProvider>
    );

    expect(await screen.findByText("Search Index")).toBeInTheDocument();
    expect(screen.getByText("Cluster Health")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
  });
});
