import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { ToastProvider } from "../../components/toast";
import AdminRankingsPage from "./page";
import { fetcher } from "../../lib/fetcher";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

const mockAppeal = {
  id: "appeal_01",
  writerId: "writer_001",
  reason: "Incorrect ranking score",
  status: "open",
  resolutionNote: null,
  resolvedByUserId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

function makeDefaultFetch(appeals: unknown[] = []) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/appeals")) {
      return jsonResponse({ appeals });
    }
    if (url.includes("/flags")) {
      return jsonResponse({ flags: [] });
    }
    if (url.includes("/prestige")) {
      return jsonResponse({ entries: [] });
    }
    return jsonResponse({});
  });
}

function renderPage() {
  return render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <ToastProvider>
        <AdminRankingsPage />
      </ToastProvider>
    </SWRConfig>
  );
}

describe("AdminRankingsPage", () => {
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
    expect(screen.getByText("Rankings administration")).toBeInTheDocument();
    expect(screen.queryByText("No appeals found")).not.toBeInTheDocument();
  });

  it("renders rankings appeals tab", async () => {
    vi.stubGlobal("fetch", makeDefaultFetch());
    renderPage();
    await screen.findByText("Rankings administration");
    expect(screen.getByText("No appeals found")).toBeInTheDocument();
  });

  it("surfaces ApiError 4xx message on appeals fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ message: "Not authorized" }, 403))
    );
    renderPage();
    await screen.findByText("Not authorized");
  });

  it("invalidates appeals cache after resolving an appeal", async () => {
    const user = userEvent.setup();
    let appealsGetCount = 0;

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/appeals") && !url.includes("/resolve") && method === "GET") {
        appealsGetCount++;
        return jsonResponse({ appeals: [mockAppeal] });
      }
      if (url.includes("/resolve") && method === "POST") {
        return jsonResponse({ appeal: { ...mockAppeal, status: "upheld" } });
      }
      if (url.includes("/flags")) {
        return jsonResponse({ flags: [] });
      }
      if (url.includes("/prestige")) {
        return jsonResponse({ entries: [] });
      }
      return jsonResponse({});
    });

    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await screen.findByText("Incorrect ranking score");
    const countBeforeMutation = appealsGetCount;

    await user.click(screen.getByRole("button", { name: /^resolve$/i }));
    await user.click(screen.getByRole("button", { name: /submit decision/i }));

    await waitFor(() => {
      expect(appealsGetCount).toBeGreaterThan(countBeforeMutation);
    });
  });

  it("renders generic error fallback when appeals error is not an ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        throw new TypeError("network down");
      })
    );
    renderPage();
    await screen.findByText("Failed to load appeals.");
  });

  it("renders 'all' filter label and switches to under_review filter", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", makeDefaultFetch());
    renderPage();

    await screen.findByText("No appeals found");
    // Default 'all' is shown
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Under Review" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Under Review" }));
    await screen.findByText("No appeals found");

    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByText("No appeals found");
  });

  it("renders appeal with resolution note and hides resolve button when not open/under_review", async () => {
    const upheldAppeal = {
      ...mockAppeal,
      id: "appeal_upheld",
      status: "upheld",
      resolutionNote: "Confirmed bug in scoring",
    };
    vi.stubGlobal("fetch", makeDefaultFetch([upheldAppeal]));
    renderPage();

    await screen.findByText("Confirmed bug in scoring");
    expect(screen.queryByRole("button", { name: /^resolve$/i })).not.toBeInTheDocument();
  });

  it("renders 'under_review' label inside status badge", async () => {
    const reviewAppeal = { ...mockAppeal, id: "a2", status: "under_review" };
    vi.stubGlobal("fetch", makeDefaultFetch([reviewAppeal]));
    renderPage();

    await screen.findByText("Under Review");
    // Resolve button visible for under_review
    expect(screen.getByRole("button", { name: /^resolve$/i })).toBeInTheDocument();
  });

  it("shows error toast when appeal resolve fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/resolve") && method === "POST") {
        return jsonResponse({ message: "Cannot resolve" }, 422);
      }
      if (url.includes("/appeals")) return jsonResponse({ appeals: [mockAppeal] });
      if (url.includes("/flags")) return jsonResponse({ flags: [] });
      if (url.includes("/prestige")) return jsonResponse({ entries: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await screen.findByText("Incorrect ranking score");
    await user.click(screen.getByRole("button", { name: /^resolve$/i }));
    await user.click(screen.getByRole("button", { name: /submit decision/i }));

    await screen.findByText("Cannot resolve");
  });

  it("shows generic error toast (non-ApiError) when appeal resolve throws", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/resolve") && method === "POST") {
        throw new TypeError("network");
      }
      if (url.includes("/appeals")) return jsonResponse({ appeals: [mockAppeal] });
      if (url.includes("/flags")) return jsonResponse({ flags: [] });
      if (url.includes("/prestige")) return jsonResponse({ entries: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await screen.findByText("Incorrect ranking score");
    await user.click(screen.getByRole("button", { name: /^resolve$/i }));
    await user.click(screen.getByRole("button", { name: /submit decision/i }));

    await screen.findByText("Failed to resolve appeal.");
  });

  it("allows changing appeal decision to rejected and editing resolution note", async () => {
    const user = userEvent.setup();
    let lastBody: string | null = null;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/resolve") && method === "POST") {
        lastBody = String(init?.body ?? "");
        return jsonResponse({ appeal: { ...mockAppeal, status: "rejected" } });
      }
      if (url.includes("/appeals")) return jsonResponse({ appeals: [mockAppeal] });
      if (url.includes("/flags")) return jsonResponse({ flags: [] });
      if (url.includes("/prestige")) return jsonResponse({ entries: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await screen.findByText("Incorrect ranking score");
    await user.click(screen.getByRole("button", { name: /^resolve$/i }));

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    await user.selectOptions(select, "rejected");
    const textarea = screen.getByPlaceholderText(/explain the reasoning/i);
    await user.type(textarea, "no merit");
    await user.click(screen.getByRole("button", { name: /submit decision/i }));

    await waitFor(() => {
      expect(lastBody).toContain("rejected");
      expect(lastBody).toContain("no merit");
    });
  });

  it("cancels appeal modal without firing resolve", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/appeals")) return jsonResponse({ appeals: [mockAppeal] });
      if (url.includes("/flags")) return jsonResponse({ flags: [] });
      if (url.includes("/prestige")) return jsonResponse({ entries: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await screen.findByText("Incorrect ranking score");
    await user.click(screen.getByRole("button", { name: /^resolve$/i }));
    expect(screen.getByText("Resolve Appeal")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([, init]) =>
          (init?.method ?? "GET").toUpperCase() === "POST"
        ).length
      ).toBe(0);
    });
  });

  it("switches to flags tab and shows empty state", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", makeDefaultFetch());
    renderPage();
    await screen.findByText("Rankings administration");

    await user.click(screen.getByRole("button", { name: "Anti-Gaming Flags" }));
    await screen.findByText("No flags found");
  });

  it("renders flags loading state when switching to flags tab", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/flags")) {
          // Never resolves
          return new Promise(() => {}) as unknown as Response;
        }
        if (url.includes("/appeals")) return jsonResponse({ appeals: [] });
        if (url.includes("/prestige")) return jsonResponse({ entries: [] });
        return jsonResponse({});
      })
    );
    renderPage();
    await screen.findByText("Rankings administration");

    await user.click(screen.getByRole("button", { name: "Anti-Gaming Flags" }));
    // The flags loading shows SkeletonCard; we don't directly assert it, but ensure "No flags found" doesn't appear
    await waitFor(() => {
      expect(screen.queryByText("No flags found")).not.toBeInTheDocument();
    });
  });

  it("shows flags ApiError message and non-ApiError fallback", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/flags")) return jsonResponse({ message: "Flags forbidden" }, 403);
        if (url.includes("/appeals")) return jsonResponse({ appeals: [] });
        if (url.includes("/prestige")) return jsonResponse({ entries: [] });
        return jsonResponse({});
      })
    );
    renderPage();
    await screen.findByText("Rankings administration");

    await user.click(screen.getByRole("button", { name: "Anti-Gaming Flags" }));
    await screen.findByText("Flags forbidden");
  });

  it("shows flags non-ApiError fallback when network throws", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/flags")) {
          throw new TypeError("offline");
        }
        if (url.includes("/appeals")) return jsonResponse({ appeals: [] });
        if (url.includes("/prestige")) return jsonResponse({ entries: [] });
        return jsonResponse({});
      })
    );
    renderPage();
    await screen.findByText("Rankings administration");
    await user.click(screen.getByRole("button", { name: "Anti-Gaming Flags" }));
    await screen.findByText("Failed to load flags.");
  });

  it("renders flag with mapped reason and shows resolve button for open flag", async () => {
    const user = userEvent.setup();
    const flag = {
      id: "flag_1",
      writerId: "w1",
      reason: "duplicate_submission",
      details: "Same script submitted twice",
      status: "open",
      resolvedByUserId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/flags")) return jsonResponse({ flags: [flag] });
        if (url.includes("/appeals")) return jsonResponse({ appeals: [] });
        if (url.includes("/prestige")) return jsonResponse({ entries: [] });
        return jsonResponse({});
      })
    );
    renderPage();
    await screen.findByText("Rankings administration");
    await user.click(screen.getByRole("button", { name: "Anti-Gaming Flags" }));

    await screen.findByText("Duplicate Submission");
    expect(screen.getByText("Same script submitted twice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^resolve$/i })).toBeInTheDocument();
  });

  it("renders flag with unmapped reason fallback and hides resolve for non-open", async () => {
    const user = userEvent.setup();
    const flag = {
      id: "flag_2",
      writerId: "w2",
      reason: "unknown_reason_xyz",
      details: "something weird",
      status: "dismissed",
      resolvedByUserId: "admin_1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/flags")) return jsonResponse({ flags: [flag] });
        if (url.includes("/appeals")) return jsonResponse({ appeals: [] });
        if (url.includes("/prestige")) return jsonResponse({ entries: [] });
        return jsonResponse({});
      })
    );
    renderPage();
    await screen.findByText("Rankings administration");
    await user.click(screen.getByRole("button", { name: "Anti-Gaming Flags" }));

    await screen.findByText("unknown_reason_xyz");
    expect(screen.queryByRole("button", { name: /^resolve$/i })).not.toBeInTheDocument();
  });

  it("changes flag filter to confirmed", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", makeDefaultFetch());
    renderPage();
    await screen.findByText("Rankings administration");
    await user.click(screen.getByRole("button", { name: "Anti-Gaming Flags" }));
    await user.click(screen.getByRole("button", { name: "Confirmed" }));
    await screen.findByText("No flags found");
  });

  it("resolves a flag successfully (with decision change to confirmed)", async () => {
    const user = userEvent.setup();
    const flag = {
      id: "flag_x",
      writerId: "wx",
      reason: "suspicious_pattern",
      details: "weird voting pattern",
      status: "open",
      resolvedByUserId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    let lastBody: string | null = null;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/flags/") && url.includes("/resolve") && method === "POST") {
        lastBody = String(init?.body ?? "");
        return jsonResponse({ flag: { ...flag, status: "confirmed" } });
      }
      if (url.includes("/flags")) return jsonResponse({ flags: [flag] });
      if (url.includes("/appeals")) return jsonResponse({ appeals: [] });
      if (url.includes("/prestige")) return jsonResponse({ entries: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("Rankings administration");
    await user.click(screen.getByRole("button", { name: "Anti-Gaming Flags" }));

    await screen.findByText("Suspicious Pattern");
    await user.click(screen.getByRole("button", { name: /^resolve$/i }));

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    await user.selectOptions(select, "confirmed");
    await user.click(screen.getByRole("button", { name: /submit decision/i }));

    await waitFor(() => {
      expect(lastBody).toContain("confirmed");
    });
  });

  it("shows error toast when flag resolve fails (ApiError)", async () => {
    const user = userEvent.setup();
    const flag = {
      id: "flag_e",
      writerId: "we",
      reason: "manual_admin",
      details: "details",
      status: "open",
      resolvedByUserId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.includes("/flags/") && url.includes("/resolve") && method === "POST") {
          return jsonResponse({ message: "Flag locked" }, 409);
        }
        if (url.includes("/flags")) return jsonResponse({ flags: [flag] });
        if (url.includes("/appeals")) return jsonResponse({ appeals: [] });
        if (url.includes("/prestige")) return jsonResponse({ entries: [] });
        return jsonResponse({});
      })
    );
    renderPage();
    await screen.findByText("Rankings administration");
    await user.click(screen.getByRole("button", { name: "Anti-Gaming Flags" }));
    await screen.findByText("Manual Admin");
    await user.click(screen.getByRole("button", { name: /^resolve$/i }));
    await user.click(screen.getByRole("button", { name: /submit decision/i }));

    await screen.findByText("Flag locked");
  });

  it("shows generic flag resolve error when fetch throws", async () => {
    const user = userEvent.setup();
    const flag = {
      id: "flag_e2",
      writerId: "we2",
      reason: "manual_admin",
      details: "details",
      status: "open",
      resolvedByUserId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.includes("/flags/") && url.includes("/resolve") && method === "POST") {
          throw new TypeError("net");
        }
        if (url.includes("/flags")) return jsonResponse({ flags: [flag] });
        if (url.includes("/appeals")) return jsonResponse({ appeals: [] });
        if (url.includes("/prestige")) return jsonResponse({ entries: [] });
        return jsonResponse({});
      })
    );
    renderPage();
    await screen.findByText("Rankings administration");
    await user.click(screen.getByRole("button", { name: "Anti-Gaming Flags" }));
    await screen.findByText("Manual Admin");
    await user.click(screen.getByRole("button", { name: /^resolve$/i }));
    await user.click(screen.getByRole("button", { name: /submit decision/i }));

    await screen.findByText("Failed to resolve flag.");
  });

  it("renders prestige tab empty state", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", makeDefaultFetch());
    renderPage();
    await screen.findByText("Rankings administration");

    await user.click(screen.getByRole("button", { name: "Prestige" }));
    await screen.findByText("No prestige entries");
  });

  it("shows prestige ApiError message", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/prestige")) return jsonResponse({ message: "Prestige denied" }, 403);
        if (url.includes("/appeals")) return jsonResponse({ appeals: [] });
        if (url.includes("/flags")) return jsonResponse({ flags: [] });
        return jsonResponse({});
      })
    );
    renderPage();
    await screen.findByText("Rankings administration");
    await user.click(screen.getByRole("button", { name: "Prestige" }));
    await screen.findByText("Prestige denied");
  });

  it("shows prestige generic error fallback when fetch throws", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/prestige")) throw new TypeError("net");
        if (url.includes("/appeals")) return jsonResponse({ appeals: [] });
        if (url.includes("/flags")) return jsonResponse({ flags: [] });
        return jsonResponse({});
      })
    );
    renderPage();
    await screen.findByText("Rankings administration");
    await user.click(screen.getByRole("button", { name: "Prestige" }));
    await screen.findByText("Failed to load prestige data.");
  });

  it("renders prestige entries table and edits an entry", async () => {
    const user = userEvent.setup();
    const entry = {
      competitionId: "comp_1",
      tier: "notable",
      multiplier: 1.5,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    let lastBody: string | null = null;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/prestige/") && method === "PUT") {
        lastBody = String(init?.body ?? "");
        return jsonResponse({ entry: { ...entry, tier: "elite", multiplier: 2 } });
      }
      if (url.includes("/prestige")) return jsonResponse({ entries: [entry] });
      if (url.includes("/appeals")) return jsonResponse({ appeals: [] });
      if (url.includes("/flags")) return jsonResponse({ flags: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("Rankings administration");
    await user.click(screen.getByRole("button", { name: "Prestige" }));

    await screen.findByText("comp_1");
    expect(screen.getByText("Notable")).toBeInTheDocument();
    expect(screen.getByText("1.5x")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const tierSelect = screen.getByRole("combobox") as HTMLSelectElement;
    await user.selectOptions(tierSelect, "elite");
    const multInput = screen.getByRole("spinbutton") as HTMLInputElement;
    await user.clear(multInput);
    await user.type(multInput, "2");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(lastBody).toContain("elite");
      expect(lastBody).toContain("2");
    });
  });

  it("shows error toast on prestige save (ApiError)", async () => {
    const user = userEvent.setup();
    const entry = {
      competitionId: "comp_err",
      tier: "standard",
      multiplier: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.includes("/prestige/") && method === "PUT") {
          return jsonResponse({ message: "Prestige conflict" }, 409);
        }
        if (url.includes("/prestige")) return jsonResponse({ entries: [entry] });
        if (url.includes("/appeals")) return jsonResponse({ appeals: [] });
        if (url.includes("/flags")) return jsonResponse({ flags: [] });
        return jsonResponse({});
      })
    );
    renderPage();
    await screen.findByText("Rankings administration");
    await user.click(screen.getByRole("button", { name: "Prestige" }));
    await screen.findByText("comp_err");
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await screen.findByText("Prestige conflict");
  });

  it("shows generic error on prestige save when fetch throws", async () => {
    const user = userEvent.setup();
    const entry = {
      competitionId: "comp_err2",
      tier: "standard",
      multiplier: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.includes("/prestige/") && method === "PUT") {
          throw new TypeError("net");
        }
        if (url.includes("/prestige")) return jsonResponse({ entries: [entry] });
        if (url.includes("/appeals")) return jsonResponse({ appeals: [] });
        if (url.includes("/flags")) return jsonResponse({ flags: [] });
        return jsonResponse({});
      })
    );
    renderPage();
    await screen.findByText("Rankings administration");
    await user.click(screen.getByRole("button", { name: "Prestige" }));
    await screen.findByText("comp_err2");
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await screen.findByText("Failed to update prestige.");
  });

  it("opens recompute confirmation modal and recomputes successfully", async () => {
    const user = userEvent.setup();
    let recomputeCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.includes("/recompute") && method === "POST") {
          recomputeCalls++;
          return jsonResponse({ message: "ok" });
        }
        if (url.includes("/prestige")) return jsonResponse({ entries: [] });
        if (url.includes("/appeals")) return jsonResponse({ appeals: [] });
        if (url.includes("/flags")) return jsonResponse({ flags: [] });
        return jsonResponse({});
      })
    );
    renderPage();
    await screen.findByText("Rankings administration");
    await user.click(screen.getByRole("button", { name: "Prestige" }));
    await user.click(screen.getByRole("button", { name: /recompute rankings/i }));
    await user.click(screen.getByRole("button", { name: /confirm recompute/i }));

    await waitFor(() => {
      expect(recomputeCalls).toBe(1);
    });
  });

  it("shows error toast on recompute (ApiError)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.includes("/recompute") && method === "POST") {
          return jsonResponse({ message: "Recompute blocked" }, 500);
        }
        if (url.includes("/prestige")) return jsonResponse({ entries: [] });
        if (url.includes("/appeals")) return jsonResponse({ appeals: [] });
        if (url.includes("/flags")) return jsonResponse({ flags: [] });
        return jsonResponse({});
      })
    );
    renderPage();
    await screen.findByText("Rankings administration");
    await user.click(screen.getByRole("button", { name: "Prestige" }));
    await user.click(screen.getByRole("button", { name: /recompute rankings/i }));
    await user.click(screen.getByRole("button", { name: /confirm recompute/i }));

    await screen.findByText("Recompute blocked");
  });

  it("shows generic error on recompute when fetch throws", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.includes("/recompute") && method === "POST") {
          throw new TypeError("net");
        }
        if (url.includes("/prestige")) return jsonResponse({ entries: [] });
        if (url.includes("/appeals")) return jsonResponse({ appeals: [] });
        if (url.includes("/flags")) return jsonResponse({ flags: [] });
        return jsonResponse({});
      })
    );
    renderPage();
    await screen.findByText("Rankings administration");
    await user.click(screen.getByRole("button", { name: "Prestige" }));
    await user.click(screen.getByRole("button", { name: /recompute rankings/i }));
    await user.click(screen.getByRole("button", { name: /confirm recompute/i }));

    await screen.findByText("Failed to recompute rankings.");
  });

  it("cancels recompute modal without firing recompute", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/prestige")) return jsonResponse({ entries: [] });
      if (url.includes("/appeals")) return jsonResponse({ appeals: [] });
      if (url.includes("/flags")) return jsonResponse({ flags: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("Rankings administration");
    await user.click(screen.getByRole("button", { name: "Prestige" }));
    await user.click(screen.getByRole("button", { name: /recompute rankings/i }));
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([url, init]) =>
          String(url).includes("/recompute") &&
          (init?.method ?? "GET").toUpperCase() === "POST"
        ).length
      ).toBe(0);
    });
  });
});
