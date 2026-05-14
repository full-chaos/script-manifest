import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { mockUseAuth } from "../../vitest.setup";
import { ToastProvider } from "../components/toast";
import * as toastModule from "../components/toast";
import { fetcher } from "../lib/fetcher";
import SubmissionsPage from "./page";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <SWRConfig
      value={{
        fetcher,
        provider: () => new Map(),
        dedupingInterval: 0,
        shouldRetryOnError: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      }}
    >
      <ToastProvider>{ui}</ToastProvider>
    </SWRConfig>
  );
}

const baseUser = {
  id: "writer_01",
  email: "writer@example.com",
  displayName: "Writer One",
  role: "writer",
  emailVerified: true,
};

const project1 = {
  id: "project_1",
  ownerUserId: "writer_01",
  title: "Project One",
  logline: "",
  synopsis: "",
  format: "feature",
  genre: "drama",
  pageCount: 100,
  isDiscoverable: true,
  createdAt: "2026-02-06T00:00:00.000Z",
  updatedAt: "2026-02-06T00:00:00.000Z",
};

const competition1 = {
  id: "comp_1",
  title: "Competition One",
  description: "",
  format: "feature",
  genre: "drama",
  feeUsd: 0,
  deadline: "2026-04-01T00:00:00.000Z",
};

describe("SubmissionsPage", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: baseUser, loading: false });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("fires no fetch and shows sign-in empty state when user is null", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<SubmissionsPage />);

    expect(screen.getByText("Sign in to track submissions")).toBeInTheDocument();
    // auth-paused keys are null → SWR must not fetch
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/submissions"),
      expect.anything()
    );
  });

  it("shows skeleton then loaded submissions on initial load", async () => {
    const submission1 = {
      id: "sub_1",
      writerId: "writer_01",
      projectId: "project_1",
      competitionId: "comp_1",
      status: "pending",
      createdAt: "2026-02-06T00:00:00.000Z",
      updatedAt: "2026-02-06T00:00:00.000Z",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/v1/projects?")) return jsonResponse({ projects: [project1] });
        if (url.includes("/api/v1/competitions")) return jsonResponse({ competitions: [competition1] });
        if (url.includes("/api/v1/submissions?")) return jsonResponse({ submissions: [submission1] });
        if (url.includes("/api/v1/placements?")) return jsonResponse({ placements: [] });
        return jsonResponse({});
      })
    );

    renderWithProviders(<SubmissionsPage />);

    // Loaded submissions appear
    await screen.findByText("sub_1");
    expect(screen.getByText("1 total")).toBeInTheDocument();
  });

  it("surfaces ApiError via toast when submissions endpoint returns 500", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/v1/submissions?")) {
          return new Response(JSON.stringify({ message: "Internal server error" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/api/v1/projects?")) return jsonResponse({ projects: [] });
        if (url.includes("/api/v1/competitions")) return jsonResponse({ competitions: [] });
        if (url.includes("/api/v1/placements?")) return jsonResponse({ placements: [] });
        return jsonResponse({});
      })
    );

    renderWithProviders(<SubmissionsPage />);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Internal server error");
    });
  });

  it("creates a submission and updates the cache without full refetch", async () => {
    const submissions: Array<Record<string, unknown>> = [];

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/v1/projects?")) return jsonResponse({ projects: [project1] });
      if (url.includes("/api/v1/competitions")) return jsonResponse({ competitions: [competition1] });
      if (url.includes("/api/v1/placements?")) return jsonResponse({ placements: [] });
      if (url.includes("/api/v1/submissions?")) return jsonResponse({ submissions });

      if (url === "/api/v1/submissions" && method === "POST") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        const created = {
          id: "sub_new",
          writerId: "writer_01",
          projectId: payload.projectId,
          competitionId: payload.competitionId,
          status: payload.status ?? "pending",
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z",
        };
        submissions.unshift(created);
        return jsonResponse({ submission: created }, 201);
      }

      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderWithProviders(<SubmissionsPage />);

    // Wait for projects and competitions to load (button becomes enabled)
    await waitFor(() => {
      expect((screen.getAllByRole("button", { name: "Create submission" })[0] as HTMLButtonElement)).not.toBeDisabled();
    });

    // Open the modal (click the hero-section button which is type="button")
    const heroBtns = screen.getAllByRole("button", { name: "Create submission" });
    await user.click(heroBtns[0] as HTMLElement);

    // Modal is now open — click the submit button (type="submit") inside the modal
    const allSubBtns = screen.getAllByRole("button", { name: "Create submission" });
    const submitBtn = allSubBtns.find((b) => (b as HTMLButtonElement).type === "submit") as HTMLElement;
    await user.click(submitBtn);

    // Cache-updated submission appears in the list
    await screen.findByText("sub_new");
    expect(screen.getByText("1 total")).toBeInTheDocument();

    // Verify POST was called (not an additional GET on the list)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/submissions",
      expect.objectContaining({ method: "POST" })
    );
  });
});
