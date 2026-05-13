import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { ToastProvider } from "../../../components/toast";
import AdminUserDetailPage from "./page";
import { fetcher } from "../../../lib/fetcher";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "user_01" })
}));

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

const mockUserDetail = {
  id: "user_01",
  email: "user@example.com",
  displayName: "User One",
  role: "writer",
  accountStatus: "active",
  emailVerified: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  sessionCount: 3,
  reportCount: 0
};

function renderPage() {
  return render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <ToastProvider>
        <AdminUserDetailPage />
      </ToastProvider>
    </SWRConfig>
  );
}

describe("AdminUserDetailPage", () => {
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
    // Shows skeleton cards during loading — no user data visible yet
    expect(screen.queryByText("User One")).not.toBeInTheDocument();
  });

  it("renders user details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ user: mockUserDetail }))
    );
    renderPage();
    await screen.findByText("User One");
    expect(screen.getByText("Account Information")).toBeInTheDocument();
  });

  it("surfaces ApiError 4xx message when user not found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ message: "User profile not accessible" }, 404))
    );
    renderPage();
    await screen.findByText("User profile not accessible");
  });

  it("invalidates user cache after a PATCH action", async () => {
    const user = userEvent.setup();
    let getCallCount = 0;

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "GET") {
        getCallCount++;
        return jsonResponse({ user: mockUserDetail });
      }
      // PATCH action
      return jsonResponse({
        user: { ...mockUserDetail, accountStatus: "suspended" }
      });
    });

    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await screen.findByText("User One");
    const countBeforeMutation = getCallCount;

    await user.click(screen.getByRole("button", { name: /suspend/i }));

    const reasonField = screen.getByPlaceholderText(/explain the reason for suspension/i);
    await user.type(reasonField, "Policy violation");

    await user.click(screen.getByRole("button", { name: /confirm suspension/i }));

    await waitFor(() => {
      expect(getCallCount).toBeGreaterThan(countBeforeMutation);
    });
  });
});
