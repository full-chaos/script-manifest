import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { ToastProvider } from "../../components/toast";
import AdminUsersPage from "./page";
import { fetcher } from "../../lib/fetcher";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush })
}));

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

const mockUser = {
  id: "user_01",
  email: "alice@example.com",
  displayName: "Alice Smith",
  role: "writer",
  accountStatus: "active",
  emailVerified: true,
  createdAt: "2026-01-01T00:00:00.000Z"
};

function renderPage() {
  return render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <ToastProvider>
        <AdminUsersPage />
      </ToastProvider>
    </SWRConfig>
  );
}

describe("AdminUsersPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders loading state initially", () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(() => new Promise(() => {})));
    renderPage();
    expect(screen.getByText("User Management")).toBeInTheDocument();
    expect(screen.queryByText("No users found")).not.toBeInTheDocument();
  });

  it("renders users table empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ users: [], total: 0, page: 1, limit: 20 }))
    );
    renderPage();
    await screen.findByText("User Management");
    expect(screen.getByText("No users found")).toBeInTheDocument();
  });

  it("surfaces ApiError 4xx message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ message: "Unauthorized" }, 401))
    );
    renderPage();
    await screen.findByText("Unauthorized");
  });

  it("re-fetches list after clicking Search", async () => {
    const user = userEvent.setup();
    let getCallCount = 0;

    const fetchMock = vi.fn<typeof fetch>(async () => {
      getCallCount++;
      return jsonResponse({ users: [mockUser], total: 1, page: 1, limit: 20 });
    });

    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await screen.findByText("Alice Smith");
    const countAfterInitialLoad = getCallCount;

    // Type a search term and click Search (commits new filter state -> new SWR key)
    await user.type(screen.getByPlaceholderText("jane@example.com"), "alice");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => {
      expect(getCallCount).toBeGreaterThan(countAfterInitialLoad);
    });
  });
});
