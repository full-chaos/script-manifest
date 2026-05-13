import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { ToastProvider } from "../../components/toast";
import AdminSecurityPage from "./page";
import { fetcher } from "../../lib/fetcher";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

const mockBlock = {
  id: "block_01",
  ipAddress: "1.2.3.4",
  reason: "Brute force",
  blockedBy: "admin",
  autoBlocked: false,
  expiresAt: null,
  createdAt: "2026-01-01T00:00:00.000Z"
};

function renderPage() {
  return render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <ToastProvider>
        <AdminSecurityPage />
      </ToastProvider>
    </SWRConfig>
  );
}

describe("AdminSecurityPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders loading state initially", () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(() => new Promise(() => {})));
    renderPage();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.queryByText("No blocked IPs")).not.toBeInTheDocument();
  });

  it("renders security management sections", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ blocks: [], total: 0 }))
    );
    renderPage();
    await screen.findByText("Security");
    expect(screen.getByText("IP Blocklist")).toBeInTheDocument();
    expect(screen.getByText("No blocked IPs")).toBeInTheDocument();
  });

  it("surfaces ApiError 4xx message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ message: "Access denied" }, 403))
    );
    renderPage();
    await screen.findByText("Access denied");
  });

  it("invalidates blocks cache after removing a block", async () => {
    const user = userEvent.setup();
    let blocksGetCount = 0;

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/ip-blocks") && method === "GET") {
        blocksGetCount++;
        return jsonResponse({ blocks: [mockBlock], total: 1 });
      }
      // DELETE
      return new Response(null, { status: 204 });
    });

    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await screen.findByText("1.2.3.4");
    const countBeforeMutation = blocksGetCount;

    await user.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => {
      expect(blocksGetCount).toBeGreaterThan(countBeforeMutation);
    });
  });
});
