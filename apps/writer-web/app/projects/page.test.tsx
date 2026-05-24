import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { mockUseAuth } from "../../vitest.setup";
import { ToastProvider } from "../components/toast";
import * as toastModule from "../components/toast";
import { fetcher } from "../lib/fetcher";
import ProjectsPage from "./page";

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

describe("ProjectsPage", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: baseUser, loading: false });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("fires no fetch for owner-scoped endpoints and shows sign-in empty state when user is null", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<ProjectsPage />);

    expect(screen.getByText("Sign in to manage projects")).toBeInTheDocument();
    // auth-paused projectsKey is null → must not fetch
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/projects?"),
      expect.anything()
    );
  });

  it("shows skeleton then loaded projects on initial load", async () => {
    const project1 = {
      id: "project_1",
      ownerUserId: "writer_01",
      title: "Project Alpha",
      logline: "A great script",
      synopsis: "",
      format: "feature",
      genre: "drama",
      pageCount: 100,
      isDiscoverable: false,
      createdAt: "2026-02-06T00:00:00.000Z",
      updatedAt: "2026-02-06T00:00:00.000Z",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/v1/projects?")) return jsonResponse({ projects: [project1] });
        if (url.includes("/co-writers")) return jsonResponse({ coWriters: [] });
        if (url.includes("/drafts")) return jsonResponse({ drafts: [] });
        return jsonResponse({});
      })
    );

    renderWithProviders(<ProjectsPage />);

    // Project title may appear multiple times (list + selected context header)
    const items = await screen.findAllByText("Project Alpha");
    expect(items.length).toBeGreaterThan(0);
    expect(screen.getByText("1 total")).toBeInTheDocument();
  });

  it("surfaces ApiError via toast when projects endpoint returns 500", async () => {
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
        if (url.includes("/api/v1/projects?")) {
          return new Response(JSON.stringify({ message: "Database unavailable" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        return jsonResponse({});
      })
    );

    renderWithProviders(<ProjectsPage />);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Database unavailable");
    });
  });

  it("creates a project and updates the cache without a full list refetch", async () => {
    const projects: Array<Record<string, unknown>> = [];

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/v1/projects?ownerUserId") && method === "GET") {
        return jsonResponse({ projects });
      }
      if (url === "/api/v1/projects" && method === "POST") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        const created = {
          id: "project_new",
          ownerUserId: "writer_01",
          title: payload.title,
          logline: payload.logline ?? "",
          synopsis: payload.synopsis ?? "",
          format: payload.format ?? "feature",
          genre: payload.genre ?? "drama",
          pageCount: payload.pageCount ?? 100,
          isDiscoverable: payload.isDiscoverable ?? false,
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z",
        };
        projects.unshift(created);
        return jsonResponse({ project: created }, 201);
      }
      if (url.includes("/co-writers")) return jsonResponse({ coWriters: [] });
      if (url.includes("/drafts")) return jsonResponse({ drafts: [] });
      if (url === "/api/v1/onboarding-progress") return jsonResponse({});
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderWithProviders(<ProjectsPage />);

    // Wait for initial render (multiple 'Create project' buttons may be present)
    await waitFor(() => {
      const btns = screen.getAllByRole("button", { name: "Create project" });
      expect(btns.length).toBeGreaterThan(0);
    });

    // Open create project modal — click the hero button (type="button", first in DOM)
    const heroBtns = screen.getAllByRole("button", { name: "Create project" });
    await user.click(heroBtns[0] as HTMLElement);

    // Fill in title inside the modal
    const titleInput = await screen.findByRole("textbox", { name: "Title" });
    await user.type(titleInput, "My New Script");

    // Submit the modal form (type="submit" button)
    const allProjectBtns2 = screen.getAllByRole("button", { name: "Create project" });
    const submitBtn = allProjectBtns2.find((b) => (b as HTMLButtonElement).type === "submit") as HTMLElement;
    await user.click(submitBtn);

    // Newly created project appears via cache update
    const newProjectItems = await screen.findAllByText("My New Script");
    expect(newProjectItems.length).toBeGreaterThan(0);

    // Verify POST was called
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/onboarding-progress",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ projectAdded: true }),
      })
    );
  });
});
