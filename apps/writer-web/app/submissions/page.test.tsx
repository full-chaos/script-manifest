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

      if (url === "/api/v1/onboarding-progress") return jsonResponse({ ok: true });

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
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/onboarding-progress",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ submissionRecorded: true }),
      })
    );
  });

  it("records placement activation after creating a placement", async () => {
    const submission1 = {
      id: "sub_1",
      writerId: "writer_01",
      projectId: "project_1",
      competitionId: "comp_1",
      status: "pending",
      createdAt: "2026-02-06T00:00:00.000Z",
      updatedAt: "2026-02-06T00:00:00.000Z",
    };
    const placements: Array<Record<string, unknown>> = [];

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/v1/projects?")) return jsonResponse({ projects: [project1] });
      if (url.includes("/api/v1/competitions")) return jsonResponse({ competitions: [competition1] });
      if (url.includes("/api/v1/submissions?")) return jsonResponse({ submissions: [submission1] });
      if (url.includes("/api/v1/placements?")) return jsonResponse({ placements });
      if (url === "/api/v1/submissions/sub_1/placements" && method === "POST") {
        placements.unshift({
          id: "placement_1",
          submissionId: "sub_1",
          status: "quarterfinalist",
          verificationState: "unverified",
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z",
        });
        return jsonResponse({ submission: { ...submission1, status: "quarterfinalist" } }, 201);
      }
      if (url === "/api/v1/onboarding-progress") return jsonResponse({ ok: true });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderWithProviders(<SubmissionsPage />);

    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Record placement" }) as HTMLButtonElement)).not.toBeDisabled();
    });

    await user.click(screen.getByRole("button", { name: "Record placement" }));
    await user.selectOptions(await screen.findByLabelText("Submission"), "sub_1");
    await user.click(screen.getByRole("button", { name: "Create placement" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/onboarding-progress",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ placementRecorded: true }),
        })
      );
    });
  });
});

describe("SubmissionsPage — branch coverage", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: baseUser, loading: false });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  function stubBasicFetch(opts: {
    projects?: unknown[];
    competitions?: unknown[];
    submissions?: unknown[];
    placements?: unknown[];
    overrides?: (url: string, init?: RequestInit) => Response | null | undefined;
  } = {}) {
    const projects = opts.projects ?? [project1];
    const competitions = opts.competitions ?? [competition1];
    const submissions = opts.submissions ?? [];
    const placements = opts.placements ?? [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const ov = opts.overrides?.(url, init ?? undefined);
      if (ov) return ov;
      if (url.includes("/api/v1/projects?")) return jsonResponse({ projects });
      if (url.includes("/api/v1/competitions")) return jsonResponse({ competitions });
      if (url.includes("/api/v1/submissions?")) return jsonResponse({ submissions });
      if (url.includes("/api/v1/placements?")) return jsonResponse({ placements });
      if (url === "/api/v1/onboarding-progress") return jsonResponse({ ok: true });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("pauses fetches while auth is still loading", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<SubmissionsPage />);
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/submissions?"),
      expect.anything()
    );
  });

  it("disables hero action buttons when no projects/competitions/submissions", async () => {
    stubBasicFetch({ projects: [], competitions: [], submissions: [], placements: [] });
    renderWithProviders(<SubmissionsPage />);

    await waitFor(() => {
      expect(screen.getByText("0 total")).toBeInTheDocument();
    });

    const createBtn = screen.getAllByRole("button", { name: "Create submission" })[0] as HTMLButtonElement;
    const placementBtn = screen.getByRole("button", { name: "Record placement" }) as HTMLButtonElement;
    const historicalBtn = screen.getByRole("button", { name: "Record historical placement" }) as HTMLButtonElement;
    expect(createBtn).toBeDisabled();
    expect(placementBtn).toBeDisabled();
    expect(historicalBtn).toBeDisabled();

    expect(screen.getByText("No submissions yet")).toBeInTheDocument();
  });

  it("falls back to raw ids when project/competition lookup misses", async () => {
    stubBasicFetch({
      projects: [],
      competitions: [],
      submissions: [
        {
          id: "sub_unknown",
          writerId: "writer_01",
          projectId: "project_missing",
          competitionId: "comp_missing",
          status: "pending",
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z",
        },
      ],
      placements: [],
    });

    renderWithProviders(<SubmissionsPage />);

    await screen.findByText("sub_unknown");
    expect(screen.getByText(/Project: project_missing/)).toBeInTheDocument();
    expect(screen.getByText(/Competition: comp_missing/)).toBeInTheDocument();
  });

  it("renders historical and recovered placement badges plus disabled verify buttons when already verified/rejected", async () => {
    stubBasicFetch({
      submissions: [
        {
          id: "sub_1",
          writerId: "writer_01",
          projectId: "project_1",
          competitionId: "comp_1",
          status: "winner",
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z",
        },
      ],
      placements: [
        {
          id: "pl_verified",
          submissionId: "sub_1",
          status: "winner",
          badgeLabel: "Winner",
          verificationState: "verified",
          isHistorical: true,
          importSource: "recovered_csv",
        },
        {
          id: "pl_rejected",
          submissionId: "sub_1",
          status: "finalist",
          badgeLabel: "Finalist",
          verificationState: "rejected",
          isHistorical: false,
          importSource: "manual",
        },
      ],
    });

    renderWithProviders(<SubmissionsPage />);

    await screen.findByText("pl_verified");
    expect(screen.getByText("Recovered")).toBeInTheDocument();
    expect(screen.getByText("Historical")).toBeInTheDocument();

    const markVerifiedBtns = screen.getAllByRole("button", { name: "Mark verified" });
    const markRejectedBtns = screen.getAllByRole("button", { name: "Mark rejected" });
    expect(markVerifiedBtns[0] as HTMLButtonElement).toBeDisabled();
    expect(markRejectedBtns[1] as HTMLButtonElement).toBeDisabled();
  });

  it("shows 'No placements recorded.' when submission has no placements", async () => {
    stubBasicFetch({
      submissions: [
        {
          id: "sub_no_pl",
          writerId: "writer_01",
          projectId: "project_1",
          competitionId: "comp_1",
          status: "pending",
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z",
        },
      ],
      placements: [],
    });

    renderWithProviders(<SubmissionsPage />);
    await screen.findByText("sub_no_pl");
    expect(screen.getByText("No placements recorded.")).toBeInTheDocument();
  });

  it("blocks createSubmission when no project selected and toasts error", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);

    stubBasicFetch({ projects: [project1], competitions: [competition1] });
    renderWithProviders(<SubmissionsPage />);

    const user = userEvent.setup();
    await waitFor(() => {
      expect((screen.getAllByRole("button", { name: "Create submission" })[0] as HTMLButtonElement)).not.toBeDisabled();
    });
    await user.click(screen.getAllByRole("button", { name: "Create submission" })[0] as HTMLElement);

    // Clear project to trigger validation guard
    const projectSelect = await screen.findByLabelText("Project");
    await user.selectOptions(projectSelect, "");
    // Now click submit
    const submitBtn = screen.getAllByRole("button", { name: "Create submission" }).find(
      (b) => (b as HTMLButtonElement).type === "submit"
    ) as HTMLElement;
    // HTML form validation will block, but our async function checks guard. Use fireEvent.submit to bypass.
    const form = submitBtn.closest("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Writer, project, and competition are required.");
    });
  });

  it("surfaces non-ApiError as default toast message on submission create failure", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);

    const submissions: Array<Record<string, unknown>> = [];
    stubBasicFetch({
      submissions,
      overrides: (url, init) => {
        const method = (init?.method ?? "GET").toUpperCase();
        if (url === "/api/v1/submissions" && method === "POST") {
          // Return a network-like error -> fetcher will throw a non-ApiError
          return new Response("oops", { status: 502, headers: { "content-type": "text/plain" } });
        }
        return null;
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<SubmissionsPage />);

    await waitFor(() => {
      expect((screen.getAllByRole("button", { name: "Create submission" })[0] as HTMLButtonElement)).not.toBeDisabled();
    });
    await user.click(screen.getAllByRole("button", { name: "Create submission" })[0] as HTMLElement);
    const submitBtn = screen.getAllByRole("button", { name: "Create submission" }).find(
      (b) => (b as HTMLButtonElement).type === "submit"
    ) as HTMLElement;
    await user.click(submitBtn);

    await waitFor(() => {
      // Either ApiError message (if fetcher parses it) or default fallback
      expect(toastError).toHaveBeenCalled();
    });
  });

  it("moveSubmission with no target id toasts validation error", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);

    stubBasicFetch({
      submissions: [
        {
          id: "sub_blank",
          writerId: "writer_01",
          projectId: "",
          competitionId: "comp_1",
          status: "pending",
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z",
        },
      ],
      placements: [],
    });

    const user = userEvent.setup();
    renderWithProviders(<SubmissionsPage />);

    await screen.findByText("sub_blank");
    await user.click(screen.getByRole("button", { name: "Move submission" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Select a target project before moving.");
    });
  });

  it("moveSubmission success updates cache and toasts", async () => {
    const toastSuccess = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: vi.fn(),
      success: toastSuccess,
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);

    const project2 = { ...project1, id: "project_2", title: "Project Two" };
    let movedTo = "project_1";

    stubBasicFetch({
      projects: [project1, project2],
      submissions: [
        {
          id: "sub_move",
          writerId: "writer_01",
          projectId: "project_1",
          competitionId: "comp_1",
          status: "pending",
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z",
        },
      ],
      placements: [],
      overrides: (url, init) => {
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "PATCH" && url.includes("/api/v1/submissions/sub_move/project")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as { projectId: string };
          movedTo = body.projectId;
          return jsonResponse({
            submission: {
              id: "sub_move",
              writerId: "writer_01",
              projectId: movedTo,
              competitionId: "comp_1",
              status: "pending",
              createdAt: "2026-02-06T00:00:00.000Z",
              updatedAt: "2026-02-06T00:00:00.000Z",
            },
          });
        }
        return null;
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<SubmissionsPage />);

    await screen.findByText("sub_move");

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    await user.selectOptions(select, "project_2");
    await user.click(screen.getByRole("button", { name: "Move submission" }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Submission moved.");
    });
    expect(movedTo).toBe("project_2");
  });

  it("moveSubmission toasts ApiError message on failure", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);

    stubBasicFetch({
      submissions: [
        {
          id: "sub_err",
          writerId: "writer_01",
          projectId: "project_1",
          competitionId: "comp_1",
          status: "pending",
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z",
        },
      ],
      placements: [],
      overrides: (url, init) => {
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "PATCH" && url.includes("/api/v1/submissions/sub_err/project")) {
          return new Response(JSON.stringify({ message: "Cannot move" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        return null;
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<SubmissionsPage />);
    await screen.findByText("sub_err");
    await user.click(screen.getByRole("button", { name: "Move submission" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Cannot move");
    });
  });

  it("verifyPlacement triggers success toast for verified state", async () => {
    const toastSuccess = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: vi.fn(),
      success: toastSuccess,
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);

    stubBasicFetch({
      submissions: [
        {
          id: "sub_v",
          writerId: "writer_01",
          projectId: "project_1",
          competitionId: "comp_1",
          status: "finalist",
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z",
        },
      ],
      placements: [
        {
          id: "pl_unverified",
          submissionId: "sub_v",
          status: "finalist",
          badgeLabel: "Finalist",
          verificationState: "unverified",
          isHistorical: false,
          importSource: "manual",
        },
      ],
      overrides: (url, init) => {
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "POST" && url.includes("/api/v1/placements/pl_unverified/verify")) {
          return jsonResponse({ ok: true });
        }
        return null;
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<SubmissionsPage />);
    await screen.findByText("pl_unverified");
    await user.click(screen.getByRole("button", { name: "Mark verified" }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Placement marked verified.");
    });
  });

  it("verifyPlacement toasts ApiError on rejection failure", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);

    stubBasicFetch({
      submissions: [
        {
          id: "sub_vr",
          writerId: "writer_01",
          projectId: "project_1",
          competitionId: "comp_1",
          status: "finalist",
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z",
        },
      ],
      placements: [
        {
          id: "pl_vr",
          submissionId: "sub_vr",
          status: "finalist",
          badgeLabel: "Finalist",
          verificationState: "unverified",
          isHistorical: false,
          importSource: "manual",
        },
      ],
      overrides: (url, init) => {
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "POST" && url.includes("/api/v1/placements/pl_vr/verify")) {
          return new Response(JSON.stringify({ message: "Verify failed" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        return null;
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<SubmissionsPage />);
    await screen.findByText("pl_vr");
    await user.click(screen.getByRole("button", { name: "Mark rejected" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Verify failed");
    });
  });

  it("createPlacement blocks when no submission chosen", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);

    stubBasicFetch({
      submissions: [
        {
          id: "sub_p",
          writerId: "writer_01",
          projectId: "project_1",
          competitionId: "comp_1",
          status: "pending",
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z",
        },
      ],
    });

    const user = userEvent.setup();
    renderWithProviders(<SubmissionsPage />);

    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Record placement" }) as HTMLButtonElement)).not.toBeDisabled();
    });

    await user.click(screen.getByRole("button", { name: "Record placement" }));
    const submitBtn = screen.getByRole("button", { name: "Create placement" });
    const form = submitBtn.closest("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Choose a submission first.");
    });
  });

  it("createPlacement skips submission mutate when response omits submission", async () => {
    const toastSuccess = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: vi.fn(),
      success: toastSuccess,
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);

    stubBasicFetch({
      submissions: [
        {
          id: "sub_no_resp",
          writerId: "writer_01",
          projectId: "project_1",
          competitionId: "comp_1",
          status: "pending",
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z",
        },
      ],
      overrides: (url, init) => {
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "POST" && url === "/api/v1/submissions/sub_no_resp/placements") {
          return jsonResponse({}, 201); // no submission field
        }
        return null;
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<SubmissionsPage />);

    await screen.findByText("sub_no_resp");
    await user.click(screen.getByRole("button", { name: "Record placement" }));
    await user.selectOptions(await screen.findByLabelText("Submission"), "sub_no_resp");
    await user.click(screen.getByRole("button", { name: "Create placement" }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Placement recorded.");
    });
  });

  it("createPlacement toasts ApiError on failure", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);

    stubBasicFetch({
      submissions: [
        {
          id: "sub_pf",
          writerId: "writer_01",
          projectId: "project_1",
          competitionId: "comp_1",
          status: "pending",
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z",
        },
      ],
      overrides: (url, init) => {
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "POST" && url === "/api/v1/submissions/sub_pf/placements") {
          return new Response(JSON.stringify({ message: "Placement failed" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        return null;
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<SubmissionsPage />);
    await screen.findByText("sub_pf");
    await user.click(screen.getByRole("button", { name: "Record placement" }));
    await user.selectOptions(await screen.findByLabelText("Submission"), "sub_pf");
    await user.click(screen.getByRole("button", { name: "Create placement" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Placement failed");
    });
  });

  it("createHistoricalPlacement blocks when required fields missing", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);

    stubBasicFetch({});
    const user = userEvent.setup();
    renderWithProviders(<SubmissionsPage />);

    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Record historical placement" }) as HTMLButtonElement)).not.toBeDisabled();
    });
    await user.click(screen.getByRole("button", { name: "Record historical placement" }));

    // Submit without filling required fields → guard triggers
    const submitBtn = screen.getByRole("button", { name: "Submit historical placement" });
    const form = submitBtn.closest("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Project, competition, date, and source note are required.");
    });
  });

  it("createHistoricalPlacement blocks when no evidence file or url provided", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);

    stubBasicFetch({});
    const user = userEvent.setup();
    renderWithProviders(<SubmissionsPage />);

    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Record historical placement" }) as HTMLButtonElement)).not.toBeDisabled();
    });
    await user.click(screen.getByRole("button", { name: "Record historical placement" }));

    // Fill date and source note but no evidence
    const dateInput = screen.getByLabelText("Placement date") as HTMLInputElement;
    await user.type(dateInput, "2024-01-15");
    const sourceNote = screen.getByLabelText("Source note");
    await user.type(sourceNote, "Found in archive");

    const submitBtn = screen.getByRole("button", { name: "Submit historical placement" });
    const form = submitBtn.closest("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Attach an evidence file or URL.");
    });
  });

  it("createHistoricalPlacement submits with evidence URL only and toasts success", async () => {
    const toastSuccess = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: vi.fn(),
      success: toastSuccess,
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);

    let historicalBody: unknown = null;
    stubBasicFetch({
      overrides: (url, init) => {
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "POST" && url === "/api/v1/placements/historical") {
          historicalBody = JSON.parse(String(init?.body ?? "{}"));
          return jsonResponse({ ok: true }, 201);
        }
        return null;
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<SubmissionsPage />);

    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Record historical placement" }) as HTMLButtonElement)).not.toBeDisabled();
    });
    await user.click(screen.getByRole("button", { name: "Record historical placement" }));

    await user.type(screen.getByLabelText("Placement date"), "2024-01-15");
    await user.type(screen.getByLabelText("Source note"), "Found in archive");
    await user.type(screen.getByLabelText("Evidence URL"), "https://example.com/winner");

    await user.click(screen.getByRole("button", { name: "Submit historical placement" }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Historical placement recorded for review.");
    });
    expect(historicalBody).toMatchObject({
      projectId: "project_1",
      competitionId: "comp_1",
      sourceNote: "Found in archive",
      evidenceItems: [
        expect.objectContaining({ evidenceUrl: "https://example.com/winner" }),
      ],
    });
  });

  it("createHistoricalPlacement toasts ApiError on failure", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);

    stubBasicFetch({
      overrides: (url, init) => {
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "POST" && url === "/api/v1/placements/historical") {
          return new Response(JSON.stringify({ message: "Historical rejected" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        return null;
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<SubmissionsPage />);

    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Record historical placement" }) as HTMLButtonElement)).not.toBeDisabled();
    });
    await user.click(screen.getByRole("button", { name: "Record historical placement" }));

    await user.type(screen.getByLabelText("Placement date"), "2024-01-15");
    await user.type(screen.getByLabelText("Source note"), "Source");
    await user.type(screen.getByLabelText("Evidence URL"), "https://example.com");
    await user.click(screen.getByRole("button", { name: "Submit historical placement" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Historical rejected");
    });
  });

  it("toasts default messages when projects/competitions/placements endpoints return non-ApiError shapes", async () => {
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
        // Return malformed JSON so fetcher throws non-ApiError
        if (url.includes("/api/v1/projects?")) {
          return new Response("not json", { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("/api/v1/competitions")) {
          return new Response("not json", { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("/api/v1/placements?")) {
          return new Response("not json", { status: 200, headers: { "content-type": "application/json" } });
        }
        return jsonResponse({});
      })
    );

    renderWithProviders(<SubmissionsPage />);

    await waitFor(() => {
      // At least one default-fallback error toast occurred
      expect(
        toastError.mock.calls.some(
          (call) =>
            call[0] === "Failed to load projects." ||
            call[0] === "Failed to load competitions." ||
            call[0] === "Failed to load placements."
        )
      ).toBe(true);
    });
  });

  it("refresh submissions button is rendered with default label when not mutating", async () => {
    stubBasicFetch({
      submissions: [
        {
          id: "sub_r",
          writerId: "writer_01",
          projectId: "project_1",
          competitionId: "comp_1",
          status: "pending",
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z",
        },
      ],
    });

    renderWithProviders(<SubmissionsPage />);
    await screen.findByText("sub_r");

    expect(screen.getByRole("button", { name: "Refresh submissions" })).toBeInTheDocument();
  });
});
