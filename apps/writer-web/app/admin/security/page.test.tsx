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

  // ── Add Block Form Validation ──────────────────────────────────

  it("shows error toast when IP is empty on add block", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ blocks: [], total: 0 }))
    );
    renderPage();
    await screen.findByText("No blocked IPs");

    await user.click(screen.getByRole("button", { name: /block ip/i }));
    expect(await screen.findByText(/ip address and reason are required/i)).toBeInTheDocument();
  });

  it("shows error toast when reason is empty but IP is filled", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ blocks: [], total: 0 }))
    );
    renderPage();
    await screen.findByText("No blocked IPs");

    await user.type(screen.getByPlaceholderText(/192.168/), "5.5.5.5");
    await user.click(screen.getByRole("button", { name: /block ip/i }));
    expect(await screen.findByText(/ip address and reason are required/i)).toBeInTheDocument();
  });

  it("shows error toast when IP is only whitespace", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ blocks: [], total: 0 }))
    );
    renderPage();
    await screen.findByText("No blocked IPs");

    await user.type(screen.getByPlaceholderText(/192.168/), "   ");
    await user.type(screen.getByPlaceholderText(/brute force/i), "spam");
    await user.click(screen.getByRole("button", { name: /block ip/i }));
    expect(await screen.findByText(/ip address and reason are required/i)).toBeInTheDocument();
  });

  // ── Add Block Success Paths ──────────────────────────────────

  it("submits add block without expires hours and shows success toast", async () => {
    const user = userEvent.setup();
    const postBody: Array<unknown> = [];

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/ip-blocks") && method === "POST") {
        postBody.push(JSON.parse(init?.body as string));
        return jsonResponse({ block: mockBlock });
      }
      if (url.includes("/ip-blocks")) {
        return jsonResponse({ blocks: [], total: 0 });
      }
      return jsonResponse({}, 404);
    });

    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("No blocked IPs");

    await user.type(screen.getByPlaceholderText(/192.168/), "9.9.9.9");
    await user.type(screen.getByPlaceholderText(/brute force/i), "abuse");
    await user.click(screen.getByRole("button", { name: /block ip/i }));

    await waitFor(() => {
      expect(postBody.length).toBeGreaterThan(0);
    });
    expect(postBody[0]).toEqual({ ipAddress: "9.9.9.9", reason: "abuse" });
    await screen.findByText(/ip address blocked successfully/i);
  });

  it("submits add block with expiresInHours when valid number > 0", async () => {
    const user = userEvent.setup();
    const postBodies: Array<Record<string, unknown>> = [];

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/ip-blocks") && method === "POST") {
        postBodies.push(JSON.parse(init?.body as string));
        return jsonResponse({ block: mockBlock });
      }
      if (url.includes("/ip-blocks")) {
        return jsonResponse({ blocks: [], total: 0 });
      }
      return jsonResponse({}, 404);
    });

    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("No blocked IPs");

    await user.type(screen.getByPlaceholderText(/192.168/), "8.8.8.8");
    await user.type(screen.getByPlaceholderText(/leave empty/i), "24");
    await user.type(screen.getByPlaceholderText(/brute force/i), "spam");
    await user.click(screen.getByRole("button", { name: /block ip/i }));

    await waitFor(() => {
      expect(postBodies.length).toBeGreaterThan(0);
    });
    expect(postBodies[0]).toEqual({ ipAddress: "8.8.8.8", reason: "spam", expiresInHours: 24 });
  });

  it("omits expiresInHours when value is zero", async () => {
    const user = userEvent.setup();
    const postBodies: Array<Record<string, unknown>> = [];

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/ip-blocks") && method === "POST") {
        postBodies.push(JSON.parse(init?.body as string));
        return jsonResponse({ block: mockBlock });
      }
      if (url.includes("/ip-blocks")) {
        return jsonResponse({ blocks: [], total: 0 });
      }
      return jsonResponse({}, 404);
    });

    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("No blocked IPs");

    await user.type(screen.getByPlaceholderText(/192.168/), "7.7.7.7");
    await user.type(screen.getByPlaceholderText(/brute force/i), "spam");
    const hoursInput = screen.getByPlaceholderText(/leave empty/i);
    await user.type(hoursInput, "0");
    await user.click(screen.getByRole("button", { name: /block ip/i }));

    await waitFor(() => {
      expect(postBodies.length).toBeGreaterThan(0);
    });
    expect(postBodies[0]).not.toHaveProperty("expiresInHours");
  });

  // ── Add Block Error Paths ────────────────────────────────────

  it("shows ApiError message on add block failure", async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/ip-blocks") && method === "POST") {
        return jsonResponse({ message: "IP already blocked" }, 409);
      }
      return jsonResponse({ blocks: [], total: 0 });
    });

    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("No blocked IPs");

    await user.type(screen.getByPlaceholderText(/192.168/), "1.1.1.1");
    await user.type(screen.getByPlaceholderText(/brute force/i), "spam");
    await user.click(screen.getByRole("button", { name: /block ip/i }));

    expect(await screen.findByText("IP already blocked")).toBeInTheDocument();
  });

  it("shows fallback error message on add block non-ApiError failure", async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/ip-blocks") && method === "POST") {
        throw new TypeError("network down");
      }
      return jsonResponse({ blocks: [], total: 0 });
    });

    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("No blocked IPs");

    await user.type(screen.getByPlaceholderText(/192.168/), "1.1.1.1");
    await user.type(screen.getByPlaceholderText(/brute force/i), "spam");
    await user.click(screen.getByRole("button", { name: /block ip/i }));

    expect(await screen.findByText(/failed to add ip block/i)).toBeInTheDocument();
  });

  // ── Remove Block Error Paths ─────────────────────────────────

  it("shows ApiError message on remove block failure", async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/ip-blocks/") && method === "DELETE") {
        return jsonResponse({ message: "Not allowed" }, 403);
      }
      if (url.includes("/ip-blocks") && method === "GET") {
        return jsonResponse({ blocks: [mockBlock], total: 1 });
      }
      return jsonResponse({}, 404);
    });

    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("1.2.3.4");

    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(await screen.findByText("Not allowed")).toBeInTheDocument();
  });

  it("shows fallback message on remove block non-ApiError failure", async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/ip-blocks/") && method === "DELETE") {
        throw new TypeError("network gone");
      }
      if (url.includes("/ip-blocks") && method === "GET") {
        return jsonResponse({ blocks: [mockBlock], total: 1 });
      }
      return jsonResponse({}, 404);
    });

    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("1.2.3.4");

    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(await screen.findByText(/failed to remove ip block/i)).toBeInTheDocument();
  });

  // ── Block list rendering branches ────────────────────────────

  it("shows fallback message when blocks fetch fails with non-ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        throw new TypeError("network unreachable");
      })
    );
    renderPage();

    expect(await screen.findByText(/failed to load ip blocks/i)).toBeInTheDocument();
  });

  it("renders Auto badge for auto-blocked entries and Expires for entries with expiresAt", async () => {
    const autoBlock = {
      ...mockBlock,
      id: "block_auto",
      ipAddress: "10.0.0.1",
      autoBlocked: true,
      expiresAt: "2099-01-01T00:00:00.000Z"
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ blocks: [autoBlock], total: 1 }))
    );
    renderPage();

    await screen.findByText("10.0.0.1");
    expect(screen.getByText("Auto")).toBeInTheDocument();
    // "Expires <date>" appears next to the block row (not the form label "Expires in (hours, optional)")
    expect(screen.getByText(/^Expires \d/)).toBeInTheDocument();
    expect(screen.queryByText("Permanent")).not.toBeInTheDocument();
  });

  it("renders Permanent badge when expiresAt is null and not auto-blocked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ blocks: [mockBlock], total: 1 }))
    );
    renderPage();

    await screen.findByText("1.2.3.4");
    expect(screen.getByText("Permanent")).toBeInTheDocument();
    expect(screen.queryByText("Auto")).not.toBeInTheDocument();
  });

  // ── Pagination ───────────────────────────────────────────────

  it("disables Previous on first page and enables Next when more pages exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        jsonResponse({ blocks: [mockBlock], total: 60 })
      )
    );
    renderPage();
    await screen.findByText("1.2.3.4");

    const prev = screen.getByRole("button", { name: /previous/i });
    const next = screen.getByRole("button", { name: /next/i });
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
  });

  it("advances to next page on Next click and disables Next on last page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      const match = /page=(\d+)/.exec(url);
      const page = match ? Number(match[1]) : 1;
      return jsonResponse({
        blocks: [{ ...mockBlock, id: `b_${page}`, ipAddress: `10.0.0.${page}` }],
        total: 40
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("10.0.0.1");

    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("10.0.0.2");
    expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /previous/i })).toBeEnabled();
  });

  it("goes back to previous page on Previous click", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      const match = /page=(\d+)/.exec(url);
      const page = match ? Number(match[1]) : 1;
      return jsonResponse({
        blocks: [{ ...mockBlock, id: `b_${page}`, ipAddress: `10.0.0.${page}` }],
        total: 40
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("10.0.0.1");

    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("10.0.0.2");
    await user.click(screen.getByRole("button", { name: /previous/i }));
    await screen.findByText("10.0.0.1");
  });

  // ── Suspension search ───────────────────────────────────────

  it("shows error toast when searching suspensions with empty userId", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ blocks: [], total: 0 }))
    );
    renderPage();
    await screen.findByText("No blocked IPs");

    await user.click(screen.getByRole("button", { name: /^search$/i }));
    expect(await screen.findByText(/enter a user id to search/i)).toBeInTheDocument();
  });

  it("triggers search on Enter key in user ID input", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/suspensions")) {
        return jsonResponse({ suspensions: [] });
      }
      return jsonResponse({ blocks: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("No blocked IPs");

    const input = screen.getByPlaceholderText(/user_abc123/);
    await user.type(input, "user_xyz");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      const called = fetchMock.mock.calls.some(([arg]) =>
        String(arg).includes("/suspensions")
      );
      expect(called).toBe(true);
    });
  });

  it("renders empty state when searched user has no suspensions", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/suspensions")) {
        return jsonResponse({ suspensions: [] });
      }
      return jsonResponse({ blocks: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("No blocked IPs");

    await user.type(screen.getByPlaceholderText(/user_abc123/), "user_xyz");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByText(/no suspensions found/i)).toBeInTheDocument();
  });

  it("renders empty state when 404 suspensions response treated as empty array", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/suspensions")) {
        return jsonResponse({ message: "not found" }, 404);
      }
      return jsonResponse({ blocks: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("No blocked IPs");

    await user.type(screen.getByPlaceholderText(/user_abc123/), "user_404");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByText(/no suspensions found/i)).toBeInTheDocument();
  });

  it("shows ApiError message when suspensions fetch fails with non-404", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/suspensions")) {
        return jsonResponse({ message: "Forbidden suspensions" }, 403);
      }
      return jsonResponse({ blocks: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("No blocked IPs");

    await user.type(screen.getByPlaceholderText(/user_abc123/), "user_403");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByText("Forbidden suspensions")).toBeInTheDocument();
  });

  it("shows fallback message when suspensions fetch fails with non-ApiError", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/suspensions")) {
        throw new TypeError("net err");
      }
      return jsonResponse({ blocks: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("No blocked IPs");

    await user.type(screen.getByPlaceholderText(/user_abc123/), "user_net");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByText(/failed to load suspensions/i)).toBeInTheDocument();
  });

  // ── Suspension rendering branches ────────────────────────────

  it("renders Lifted badge when suspension has liftedAt", async () => {
    const user = userEvent.setup();
    const suspension = {
      id: "sus_1",
      userId: "user_1",
      reason: "Repeated abuse",
      suspendedBy: "admin",
      durationDays: 7,
      startedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-08T00:00:00.000Z",
      liftedAt: "2026-01-05T00:00:00.000Z",
      liftedBy: "mod_42",
      createdAt: "2026-01-01T00:00:00.000Z"
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/suspensions")) {
        return jsonResponse({ suspensions: [suspension] });
      }
      return jsonResponse({ blocks: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("No blocked IPs");

    await user.type(screen.getByPlaceholderText(/user_abc123/), "user_1");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    await screen.findByText("Repeated abuse");
    expect(screen.getByText("Lifted")).toBeInTheDocument();
    expect(screen.getByText(/7 days/)).toBeInTheDocument();
    expect(screen.getByText(/Lifted .* by mod_42/)).toBeInTheDocument();
  });

  it("renders Active (Temporary) when no liftedAt but expiresAt set", async () => {
    const user = userEvent.setup();
    const suspension = {
      id: "sus_2",
      userId: "user_2",
      reason: "Spam wave",
      suspendedBy: "admin",
      durationDays: 3,
      startedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-04T00:00:00.000Z",
      liftedAt: null,
      liftedBy: null,
      createdAt: "2026-01-01T00:00:00.000Z"
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/suspensions")) {
        return jsonResponse({ suspensions: [suspension] });
      }
      return jsonResponse({ blocks: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("No blocked IPs");

    await user.type(screen.getByPlaceholderText(/user_abc123/), "user_2");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    await screen.findByText("Spam wave");
    expect(screen.getByText("Active (Temporary)")).toBeInTheDocument();
    // The "Started ... | Expires ..." paragraph contains "| Expires"
    expect(screen.getByText(/\| Expires /)).toBeInTheDocument();
  });

  it("renders Active (Permanent) when no liftedAt and no expiresAt and Permanent duration", async () => {
    const user = userEvent.setup();
    const suspension = {
      id: "sus_3",
      userId: "user_3",
      reason: "Severe ToS breach",
      suspendedBy: "admin",
      durationDays: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: null,
      liftedAt: null,
      liftedBy: null,
      createdAt: "2026-01-01T00:00:00.000Z"
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/suspensions")) {
        return jsonResponse({ suspensions: [suspension] });
      }
      return jsonResponse({ blocks: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("No blocked IPs");

    await user.type(screen.getByPlaceholderText(/user_abc123/), "user_3");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    await screen.findByText("Severe ToS breach");
    expect(screen.getByText("Active (Permanent)")).toBeInTheDocument();
    expect(screen.getByText(/Duration: Permanent/)).toBeInTheDocument();
  });

  it("falls back to 'system' when liftedBy is null on a lifted suspension", async () => {
    const user = userEvent.setup();
    const suspension = {
      id: "sus_4",
      userId: "user_4",
      reason: "Auto-lifted",
      suspendedBy: "admin",
      durationDays: 1,
      startedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: null,
      liftedAt: "2026-01-02T00:00:00.000Z",
      liftedBy: null,
      createdAt: "2026-01-01T00:00:00.000Z"
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/suspensions")) {
        return jsonResponse({ suspensions: [suspension] });
      }
      return jsonResponse({ blocks: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("No blocked IPs");

    await user.type(screen.getByPlaceholderText(/user_abc123/), "user_4");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    await screen.findByText("Auto-lifted");
    expect(screen.getByText(/by system/)).toBeInTheDocument();
  });
});
