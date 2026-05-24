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

const timestamp = "2026-02-06T00:00:00.000Z";

function projectFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "project_alpha",
    ownerUserId: "writer_01",
    title: "Project Alpha",
    logline: "A great script",
    synopsis: "",
    format: "feature",
    genre: "drama",
    pageCount: 100,
    isDiscoverable: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function draftFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft_alpha",
    projectId: "project_alpha",
    scriptId: "script_alpha",
    versionLabel: "v1",
    changeSummary: "First pass",
    pageCount: 101,
    lifecycleState: "active",
    isPrimary: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function accessRequestFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "request_alpha",
    scriptId: "script_alpha",
    requesterUserId: "reader_01",
    status: "pending",
    reason: "Please review this draft.",
    decisionReason: null,
    requestedAt: timestamp,
    decidedAt: null,
    ...overrides,
  };
}

function mockProjectsFetch({
  projects = [],
  coWriters = [],
  drafts = [],
  accessRequests = [],
  recommendations = [],
}: {
  projects?: Array<Record<string, unknown>>;
  coWriters?: Array<Record<string, unknown>>;
  drafts?: Array<Record<string, unknown>>;
  accessRequests?: Array<Record<string, unknown>>;
  recommendations?: Array<Record<string, unknown>>;
} = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;

    if (url.includes("/api/v1/projects?") && url.includes("ownerUserId")) {
      return jsonResponse({ projects });
    }
    if (url.includes("/recommended-competitions")) {
      return jsonResponse({ recommendations });
    }
    if (url.includes("/co-writers")) {
      return jsonResponse({ coWriters });
    }
    if (url.includes("/drafts")) {
      return jsonResponse({ drafts });
    }
    if (url.includes("/access-requests")) {
      return jsonResponse({ accessRequests });
    }

    return jsonResponse({});
  });
}

describe("ProjectsPage branch coverage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    mockUseAuth.mockReturnValue({ user: baseUser, loading: false });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the signed-in empty state and closes an opened create-project modal", async () => {
    mockProjectsFetch();
    const user = userEvent.setup();

    renderWithProviders(<ProjectsPage />);

    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    expect(screen.getByText("Select a project")).toBeInTheDocument();
    expect(screen.getByText("0 total")).toBeInTheDocument();
    expect(screen.getByText("ID: writer_01")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Create project" })[0] as HTMLElement);
    expect(await screen.findByRole("dialog", { name: "Create project" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Create project" })).not.toBeInTheDocument();
    });
  });

  it("renders selected project details, draft states, and access request branches", async () => {
    const projects = [
      projectFixture({ id: "project_alpha", title: "Project Alpha", logline: "A great script", isDiscoverable: true }),
      projectFixture({ id: "project_beta", title: "Project Beta", logline: "", format: "pilot", genre: "comedy", pageCount: 42 }),
    ];
    const drafts = [
      draftFixture({ id: "draft_primary", scriptId: "script_primary", versionLabel: "v2", isPrimary: true }),
      draftFixture({
        id: "draft_archived",
        scriptId: "script_archived",
        versionLabel: "v1",
        changeSummary: "",
        lifecycleState: "archived",
        isPrimary: false,
        pageCount: 98,
      }),
    ];
    const accessRequests = [
      accessRequestFixture({ id: "request_pending", scriptId: "script_primary", status: "pending" }),
      accessRequestFixture({
        id: "request_approved",
        scriptId: "script_primary",
        requesterUserId: "reader_02",
        status: "approved",
        reason: "",
        decidedAt: timestamp,
        decisionReason: "",
      }),
    ];

    mockProjectsFetch({
      projects,
      coWriters: [{ projectId: "project_alpha", coWriterUserId: "writer_02", creditOrder: 3 }],
      drafts,
      accessRequests,
    });

    renderWithProviders(<ProjectsPage />);

    expect((await screen.findAllByText("Project Alpha")).length).toBeGreaterThan(0);
    expect(screen.getByText("2 total")).toBeInTheDocument();
    expect(screen.getByText("No logline provided.")).toBeInTheDocument();
    expect(screen.getByText("drama | 100 pages | Discoverable")).toBeInTheDocument();
    expect(screen.getByText("comedy | 42 pages | Private")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Selected" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select" })).toBeInTheDocument();

    expect(await screen.findByText("writer_02")).toBeInTheDocument();
    expect(screen.getByText("Credit order: 3")).toBeInTheDocument();
    expect(screen.queryByText("No co-writers added yet.")).not.toBeInTheDocument();

    expect(screen.getByText("v2 (script_primary)")).toBeInTheDocument();
    expect(screen.getByText("active | primary")).toBeInTheDocument();
    expect(screen.getByText("v1 (script_archived)")).toBeInTheDocument();
    expect(screen.getByText("archived")).toBeInTheDocument();
    expect(screen.getByText("First pass")).toBeInTheDocument();
    expect(screen.queryByText("No drafts added yet.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tracking access" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Track access" })).toBeInTheDocument();

    expect(await screen.findByText("reader_01")).toBeInTheDocument();
    expect(screen.getByText("Please review this draft.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.getByText("reader_02")).toBeInTheDocument();
    expect(screen.getByText(/Decision: No reason provided/)).toBeInTheDocument();
  });

  it("blocks project creation when the authenticated owner id is blank", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    mockUseAuth.mockReturnValue({ user: { ...baseUser, id: "   " }, loading: false });
    const fetchMock = mockProjectsFetch();
    const user = userEvent.setup();

    renderWithProviders(<ProjectsPage />);

    await user.click((await screen.findAllByRole("button", { name: "Create project" }))[0] as HTMLElement);
    await user.type(await screen.findByRole("textbox", { name: "Title" }), "Blank Owner Project");
    const submit = screen.getAllByRole("button", { name: "Create project" }).find((button) =>
      (button as HTMLButtonElement).type === "submit"
    ) as HTMLElement;
    await user.click(submit);

    expect(toastError).toHaveBeenCalledWith("Owner ID is required.");
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/v1/projects",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("deletes the selected project and clears project context", async () => {
    const toastSuccess = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: vi.fn(),
      success: toastSuccess,
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/v1/projects?") && method === "GET") {
        return jsonResponse({ projects: [projectFixture()] });
      }
      if (url.includes("/recommended-competitions")) return jsonResponse({ recommendations: [] });
      if (url.includes("/co-writers")) return jsonResponse({ coWriters: [] });
      if (url.includes("/drafts")) return jsonResponse({ drafts: [] });
      if (url === "/api/v1/projects/project_alpha" && method === "DELETE") {
        return jsonResponse({ deleted: true });
      }
      return jsonResponse({});
    });
    const user = userEvent.setup();

    renderWithProviders(<ProjectsPage />);
    expect((await screen.findAllByText("Project Alpha")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Project deleted.");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects/project_alpha",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(screen.getByText("0 total")).toBeInTheDocument();
    expect(screen.getByText("Select a project")).toBeInTheDocument();
  });

  it("surfaces a project delete API error without removing the project", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/v1/projects?") && method === "GET") {
        return jsonResponse({ projects: [projectFixture()] });
      }
      if (url.includes("/recommended-competitions")) return jsonResponse({ recommendations: [] });
      if (url.includes("/co-writers")) return jsonResponse({ coWriters: [] });
      if (url.includes("/drafts")) return jsonResponse({ drafts: [] });
      if (url === "/api/v1/projects/project_alpha" && method === "DELETE") {
        return jsonResponse({ error: "Project is locked" }, 409);
      }
      return jsonResponse({});
    });
    const user = userEvent.setup();

    renderWithProviders(<ProjectsPage />);
    expect((await screen.findAllByText("Project Alpha")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Project is locked");
    });
    expect(screen.getByText("1 total")).toBeInTheDocument();
  });

  it("adds and removes co-writers with the selected project id", async () => {
    const toastSuccess = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: vi.fn(),
      success: toastSuccess,
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/v1/projects?") && method === "GET") return jsonResponse({ projects: [projectFixture()] });
      if (url.includes("/recommended-competitions")) return jsonResponse({ recommendations: [] });
      if (url.endsWith("/co-writers") && method === "GET") {
        return jsonResponse({ coWriters: [{ projectId: "project_alpha", coWriterUserId: "writer_02", creditOrder: 2 }] });
      }
      if (url.endsWith("/co-writers") && method === "POST") return jsonResponse({ coWriter: {} }, 201);
      if (url.includes("/co-writers/writer_02") && method === "DELETE") return jsonResponse({ removed: true });
      if (url.includes("/drafts")) return jsonResponse({ drafts: [] });
      return jsonResponse({});
    });
    const user = userEvent.setup();

    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText("writer_02")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add co-writer" }));
    await user.type(await screen.findByRole("textbox", { name: "Co-writer user ID" }), "writer_03");
    const creditOrderInput = screen.getByRole("spinbutton", { name: "Credit order" });
    await user.clear(creditOrderInput);
    await user.type(creditOrderInput, "4");
    await user.click(screen.getAllByRole("button", { name: "Add co-writer" }).find((button) =>
      (button as HTMLButtonElement).type === "submit"
    ) as HTMLElement);

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Co-writer added.");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects/project_alpha/co-writers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ coWriterUserId: "writer_03", creditOrder: 4 }),
      })
    );

    await user.click(screen.getByRole("button", { name: "Remove co-writer" }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Co-writer removed.");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects/project_alpha/co-writers/writer_02",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("uploads a script file, registers it, and creates a draft", async () => {
    const toastSuccess = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: vi.fn(),
      success: toastSuccess,
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/v1/projects?") && method === "GET") return jsonResponse({ projects: [projectFixture()] });
      if (url.includes("/recommended-competitions")) return jsonResponse({ recommendations: [] });
      if (url.includes("/co-writers")) return jsonResponse({ coWriters: [] });
      if (url.endsWith("/drafts") && method === "GET") return jsonResponse({ drafts: [] });
      if (url === "/api/v1/scripts/upload" && method === "POST") {
        return jsonResponse({ uploaded: true, objectKey: "scripts/uploaded-draft" });
      }
      if (url === "/api/v1/scripts/register" && method === "POST") {
        return jsonResponse({ script: { scriptId: "script_registered" } }, 201);
      }
      if (url.endsWith("/drafts") && method === "POST") return jsonResponse({ draft: draftFixture() }, 201);
      return jsonResponse({});
    });
    const user = userEvent.setup();

    renderWithProviders(<ProjectsPage />);
    expect((await screen.findAllByText("Project Alpha")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Create draft" }));
    await user.upload(
      screen.getByLabelText("Script file"),
      new File(["FADE IN"], "draft.txt", { type: "" })
    );
    await user.click(screen.getByRole("button", { name: "Upload + register script" }));

    expect(await screen.findByText("Uploaded: script_registered")).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith("Script uploaded and registered.");
    const registerCall = fetchMock.mock.calls.find(([input]) => input === "/api/v1/scripts/register");
    expect(JSON.parse(String(registerCall?.[1]?.body))).toEqual(expect.objectContaining({
      scriptId: expect.stringMatching(/^script_/),
      ownerUserId: "writer_01",
      objectKey: "scripts/uploaded-draft",
      filename: "draft.txt",
      contentType: "application/octet-stream",
      size: 7,
    }));

    await user.type(screen.getByRole("textbox", { name: "Version label" }), "v3");
    await user.type(screen.getByRole("textbox", { name: "Change summary" }), "Polish pass");
    const draftPageCount = screen.getByRole("spinbutton", { name: "Page count" });
    await user.clear(draftPageCount);
    await user.type(draftPageCount, "110");
    await user.click(screen.getByRole("checkbox", { name: "Set as primary draft" }));
    await user.click(screen.getAllByRole("button", { name: "Create draft" }).find((button) =>
      (button as HTMLButtonElement).type === "submit"
    ) as HTMLElement);

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Draft created.");
    });
    const draftCall = fetchMock.mock.calls.find(([input, init]) =>
      String(input).endsWith("/drafts") && (init?.method ?? "GET") === "POST"
    );
    expect(JSON.parse(String(draftCall?.[1]?.body))).toEqual(expect.objectContaining({
      scriptId: "script_registered",
      versionLabel: "v3",
      changeSummary: "Polish pass",
      pageCount: 110,
      setPrimary: false,
    }));
  });

  it("surfaces file upload text fallback errors", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/v1/projects?") && method === "GET") return jsonResponse({ projects: [projectFixture()] });
      if (url.includes("/recommended-competitions")) return jsonResponse({ recommendations: [] });
      if (url.includes("/co-writers")) return jsonResponse({ coWriters: [] });
      if (url.includes("/drafts")) return jsonResponse({ drafts: [] });
      if (url === "/api/v1/scripts/upload" && method === "POST") {
        return {
          ok: false,
          json: async () => {
            throw new Error("not json");
          },
          text: async () => "Upload proxy unavailable",
        } as unknown as Response;
      }
      return jsonResponse({});
    });
    const user = userEvent.setup();

    renderWithProviders(<ProjectsPage />);
    expect((await screen.findAllByText("Project Alpha")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Create draft" }));
    await user.upload(
      screen.getByLabelText("Script file"),
      new File(["FADE IN"], "draft.pdf", { type: "application/pdf" })
    );
    await user.click(screen.getByRole("button", { name: "Upload + register script" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Upload proxy unavailable");
    });
  });

  it("sets primary drafts, archives drafts, and decides access requests", async () => {
    const toastSuccess = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: vi.fn(),
      success: toastSuccess,
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    const drafts = [
      draftFixture({ id: "draft_primary", scriptId: "script_primary", isPrimary: true, versionLabel: "v1" }),
      draftFixture({ id: "draft_secondary", scriptId: "script_secondary", isPrimary: false, versionLabel: "v2" }),
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/v1/projects?") && method === "GET") return jsonResponse({ projects: [projectFixture()] });
      if (url.includes("/recommended-competitions")) return jsonResponse({ recommendations: [] });
      if (url.includes("/co-writers")) return jsonResponse({ coWriters: [] });
      if (url.endsWith("/drafts") && method === "GET") return jsonResponse({ drafts });
      if (url.endsWith("/draft_secondary/primary") && method === "POST") return jsonResponse({ updated: true });
      if (url.endsWith("/draft_secondary") && method === "PATCH") return jsonResponse({ archived: true });
      if (url.includes("/access-requests?") && method === "GET") {
        return jsonResponse({ accessRequests: [accessRequestFixture({ id: "request_pending" })] });
      }
      if (url.endsWith("/request_pending/approve") && method === "POST") return jsonResponse({ approved: true });
      if (url.endsWith("/request_pending/reject") && method === "POST") return jsonResponse({ rejected: true });
      return jsonResponse({});
    });
    const user = userEvent.setup();

    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText("v2 (script_secondary)")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Set primary" })[1] as HTMLElement);
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Primary draft updated.");
    });

    await user.click(screen.getAllByRole("button", { name: "Archive" })[1] as HTMLElement);
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Draft archived.");
    });

    await user.type(await screen.findByPlaceholderText("Decision reason (optional)"), "Approved for coverage");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Access request approved.");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/scripts/script_primary/access-requests/request_pending/approve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ decisionReason: "Approved for coverage" }),
      })
    );

    await user.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Access request rejectd.");
    });
  });

  it("creates an access request and omits a blank reason", async () => {
    const toastSuccess = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: vi.fn(),
      success: toastSuccess,
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/v1/projects?") && method === "GET") return jsonResponse({ projects: [projectFixture()] });
      if (url.includes("/recommended-competitions")) return jsonResponse({ recommendations: [] });
      if (url.includes("/co-writers")) return jsonResponse({ coWriters: [] });
      if (url.endsWith("/drafts") && method === "GET") return jsonResponse({ drafts: [draftFixture()] });
      if (url.includes("/access-requests?") && method === "GET") return jsonResponse({ accessRequests: [] });
      if (url.endsWith("/access-requests") && method === "POST") return jsonResponse({ accessRequest: {} }, 201);
      return jsonResponse({});
    });
    const user = userEvent.setup();

    renderWithProviders(<ProjectsPage />);
    await screen.findByText("No access requests");

    await user.click(screen.getByRole("button", { name: "New access request" }));
    await user.type(await screen.findByRole("textbox", { name: "Requester user ID" }), "reader_99");
    await user.click(screen.getByRole("button", { name: "Record request" }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Access request recorded.");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/scripts/script_alpha/access-requests",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ requesterUserId: "reader_99" }),
      })
    );
  });

  it("creates an access request with a trimmed reason", async () => {
    const toastSuccess = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: vi.fn(),
      success: toastSuccess,
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/v1/projects?") && method === "GET") return jsonResponse({ projects: [projectFixture()] });
      if (url.includes("/recommended-competitions")) return jsonResponse({ recommendations: [] });
      if (url.includes("/co-writers")) return jsonResponse({ coWriters: [] });
      if (url.endsWith("/drafts") && method === "GET") return jsonResponse({ drafts: [draftFixture()] });
      if (url.includes("/access-requests?") && method === "GET") return jsonResponse({ accessRequests: [] });
      if (url.endsWith("/access-requests") && method === "POST") return jsonResponse({ accessRequest: {} }, 201);
      return jsonResponse({});
    });
    const user = userEvent.setup();

    renderWithProviders(<ProjectsPage />);
    await screen.findByText("No access requests");

    await user.click(screen.getByRole("button", { name: "New access request" }));
    await user.type(await screen.findByRole("textbox", { name: "Requester user ID" }), "reader_77");
    await user.type(screen.getByRole("textbox", { name: "Reason (optional)" }), "  Coverage review  ");
    await user.click(screen.getByRole("button", { name: "Record request" }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Access request recorded.");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/scripts/script_alpha/access-requests",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ requesterUserId: "reader_77", reason: "Coverage review" }),
      })
    );
  });

  it("surfaces failed co-writer, draft, and access mutations", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    const drafts = [
      draftFixture({ id: "draft_primary", scriptId: "script_primary", isPrimary: true, versionLabel: "v1" }),
      draftFixture({ id: "draft_secondary", scriptId: "script_secondary", isPrimary: false, versionLabel: "v2" }),
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/v1/projects?") && method === "GET") return jsonResponse({ projects: [projectFixture()] });
      if (url.includes("/recommended-competitions")) return jsonResponse({ recommendations: [] });
      if (url.endsWith("/co-writers") && method === "GET") {
        return jsonResponse({ coWriters: [{ projectId: "project_alpha", coWriterUserId: "writer_02", creditOrder: 2 }] });
      }
      if (url.endsWith("/co-writers") && method === "POST") return jsonResponse({}, 400);
      if (url.includes("/co-writers/writer_02") && method === "DELETE") {
        return jsonResponse({ error: "Cannot remove co-writer" }, 409);
      }
      if (url.endsWith("/drafts") && method === "GET") return jsonResponse({ drafts });
      if (url.endsWith("/drafts") && method === "POST") return jsonResponse({}, 400);
      if (url.endsWith("/draft_secondary/primary") && method === "POST") {
        return jsonResponse({ error: "Cannot promote draft" }, 409);
      }
      if (url.endsWith("/draft_secondary") && method === "PATCH") return jsonResponse({}, 409);
      if (url.includes("/access-requests?") && method === "GET") {
        return jsonResponse({ accessRequests: [accessRequestFixture({ id: "request_pending" })] });
      }
      if (url.endsWith("/access-requests") && method === "POST") {
        return jsonResponse({ error: "Duplicate request" }, 409);
      }
      if (url.endsWith("/request_pending/reject") && method === "POST") return jsonResponse({}, 409);
      return jsonResponse({});
    });
    const user = userEvent.setup();

    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText("writer_02")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add co-writer" }));
    await user.type(await screen.findByRole("textbox", { name: "Co-writer user ID" }), "writer_03");
    await user.click(screen.getAllByRole("button", { name: "Add co-writer" }).find((button) =>
      (button as HTMLButtonElement).type === "submit"
    ) as HTMLElement);
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Unable to add co-writer.");
    });
    await user.click(screen.getByRole("button", { name: "Close" }));

    await user.click(screen.getByRole("button", { name: "Remove co-writer" }));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Cannot remove co-writer");
    });

    await user.click(screen.getByRole("button", { name: "Create draft" }));
    await user.type(await screen.findByRole("textbox", { name: "Script ID" }), "script_manual");
    await user.click(screen.getAllByRole("button", { name: "Create draft" }).find((button) =>
      (button as HTMLButtonElement).type === "submit"
    ) as HTMLElement);
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Unable to create draft.");
    });
    await user.click(screen.getByRole("button", { name: "Close" }));

    await user.click(screen.getAllByRole("button", { name: "Set primary" })[1] as HTMLElement);
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Cannot promote draft");
    });

    await user.click(screen.getAllByRole("button", { name: "Archive" })[1] as HTMLElement);
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Unable to archive draft.");
    });

    await user.click(screen.getByRole("button", { name: "New access request" }));
    await user.type(await screen.findByRole("textbox", { name: "Requester user ID" }), "reader_42");
    await user.click(screen.getByRole("button", { name: "Record request" }));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Duplicate request");
    });
    await user.click(screen.getByRole("button", { name: "Close" }));

    await user.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Unable to reject access request.");
    });
  });
});
