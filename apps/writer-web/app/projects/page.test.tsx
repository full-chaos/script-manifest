import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/toast";
import ProjectsPage from "./page";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function renderWithProviders(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

describe("ProjectsPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(
      "script_manifest_session",
      JSON.stringify({
        token: "sess_1",
        expiresAt: "2026-02-13T00:00:00.000Z",
        user: {
          id: "writer_01",
          email: "writer@example.com",
          displayName: "Writer One"
        }
      })
    );
    vi.restoreAllMocks();
  });

  it("autoloads projects and supports modal co-writer + draft lifecycle actions", async () => {
    const projects: Array<Record<string, unknown>> = [];
    const coWriters: Array<Record<string, unknown>> = [];
    const drafts: Array<Record<string, unknown>> = [];
    const accessRequests: Array<Record<string, unknown>> = [];
    let uploadedScriptId = "";

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.startsWith("/api/v1/projects?") && method === "GET") {
        return jsonResponse({ projects });
      }

      if (url === "/api/v1/projects" && method === "POST") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        const project = {
          id: "project_1",
          ownerUserId: "writer_01",
          title: payload.title,
          logline: payload.logline,
          synopsis: payload.synopsis,
          format: payload.format,
          genre: payload.genre,
          pageCount: payload.pageCount,
          isDiscoverable: payload.isDiscoverable,
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z"
        };
        projects.unshift(project);
        return jsonResponse({ project }, 201);
      }

      if (url === "/api/v1/projects/project_1" && method === "DELETE") {
        projects.splice(
          0,
          projects.length,
          ...projects.filter((project) => project.id !== "project_1")
        );
        coWriters.splice(0, coWriters.length);
        drafts.splice(0, drafts.length);
        return jsonResponse({ deleted: true });
      }

      if (url === "/api/v1/projects/project_1/co-writers" && method === "GET") {
        return jsonResponse({ coWriters });
      }

      if (url === "/api/v1/projects/project_1/co-writers" && method === "POST") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        const coWriter = {
          projectId: "project_1",
          ownerUserId: "writer_01",
          coWriterUserId: payload.coWriterUserId,
          creditOrder: payload.creditOrder,
          createdAt: "2026-02-06T00:00:00.000Z"
        };
        coWriters.push(coWriter);
        return jsonResponse({ coWriter }, 201);
      }

      if (url === "/api/v1/projects/project_1/co-writers/writer_02" && method === "DELETE") {
        coWriters.splice(
          0,
          coWriters.length,
          ...coWriters.filter((entry) => entry.coWriterUserId !== "writer_02")
        );
        return jsonResponse({ deleted: true });
      }

      if (url === "/api/v1/projects/project_1/drafts" && method === "GET") {
        return jsonResponse({ drafts });
      }

      if (url.includes("/api/v1/scripts/") && url.includes("/access-requests") && method === "GET") {
        return jsonResponse({ accessRequests });
      }

      if (url === "/api/v1/scripts/upload-session" && method === "POST") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        uploadedScriptId = String(payload.scriptId ?? "");
        return jsonResponse(
          {
            uploadUrl: "http://upload-svc/scripts",
            uploadFields: {
              key: `writer_01/${uploadedScriptId}/latest.pdf`,
              bucket: "scripts",
              "Content-Type": String(payload.contentType ?? "application/octet-stream")
            },
            bucket: "scripts",
            objectKey: `writer_01/${uploadedScriptId}/latest.pdf`,
            expiresAt: "2026-02-06T00:10:00.000Z"
          },
          201
        );
      }

      if (url === "http://upload-svc/scripts" && method === "POST") {
        return new Response(null, { status: 204 });
      }

      if (url === "/api/v1/scripts/register" && method === "POST") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        const script = {
          scriptId: payload.scriptId,
          ownerUserId: payload.ownerUserId,
          objectKey: payload.objectKey,
          filename: payload.filename,
          contentType: payload.contentType,
          size: payload.size,
          registeredAt: "2026-02-06T00:00:00.000Z"
        };
        return jsonResponse({ registered: true, script }, 201);
      }

      if (url === "/api/v1/projects/project_1/drafts" && method === "POST") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        const setPrimary = Boolean(payload.setPrimary);
        if (setPrimary) {
          for (const draft of drafts) {
            draft.isPrimary = false;
          }
        }
        const draft = {
          id: `draft_${drafts.length + 1}`,
          projectId: "project_1",
          ownerUserId: "writer_01",
          scriptId: payload.scriptId,
          versionLabel: payload.versionLabel,
          changeSummary: payload.changeSummary,
          pageCount: payload.pageCount,
          lifecycleState: "active",
          isPrimary: setPrimary || drafts.length === 0,
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z"
        };
        drafts.unshift(draft);
        return jsonResponse({ draft }, 201);
      }

      if (url === "/api/v1/projects/project_1/drafts/draft_2/primary" && method === "POST") {
        for (const draft of drafts) {
          draft.isPrimary = draft.id === "draft_2";
        }
        const draft = drafts.find((entry) => entry.id === "draft_2");
        return jsonResponse({ draft });
      }

      if (url === "/api/v1/projects/project_1/drafts/draft_2" && method === "PATCH") {
        for (const draft of drafts) {
          if (draft.id === "draft_2") {
            draft.lifecycleState = "archived";
            draft.isPrimary = false;
          }
          if (draft.id === "draft_1") {
            draft.isPrimary = true;
          }
        }
        const draft = drafts.find((entry) => entry.id === "draft_2");
        return jsonResponse({ draft });
      }

      if (url.includes("/api/v1/scripts/") && url.endsWith("/access-requests") && method === "POST") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        const accessRequest = {
          id: "access_1",
          scriptId: uploadedScriptId || "script_1",
          requesterUserId: payload.requesterUserId,
          ownerUserId: payload.ownerUserId,
          status: "pending",
          reason: payload.reason ?? "",
          decisionReason: null,
          decidedByUserId: null,
          requestedAt: "2026-02-06T00:00:00.000Z",
          decidedAt: null,
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z"
        };
        accessRequests.unshift(accessRequest);
        return jsonResponse({ accepted: true, eventId: "evt_1", accessRequest }, 202);
      }

      if (url.includes("/api/v1/scripts/") && url.endsWith("/access-requests/access_1/approve") && method === "POST") {
        if (accessRequests[0]) {
          accessRequests[0] = {
            ...accessRequests[0],
            status: "approved",
            decisionReason: "Looks good",
            decidedByUserId: "writer_01",
            decidedAt: "2026-02-06T01:00:00.000Z",
            updatedAt: "2026-02-06T01:00:00.000Z"
          };
        }
        return jsonResponse({ accessRequest: accessRequests[0] });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<ProjectsPage />);
    const user = userEvent.setup();

    await screen.findByText("Loaded 0 projects.");

    // Hero and EmptyState both show "Create project" — click the first one
    await user.click(screen.getAllByRole("button", { name: "Create project" })[0]!);
    const projectDialog = await screen.findByRole("dialog", { name: "Create project" });

    await user.type(within(projectDialog).getByLabelText("Title"), "My Script");
    await user.type(within(projectDialog).getByLabelText("Logline"), "A writer keeps shipping");
    await user.click(within(projectDialog).getByRole("button", { name: "Create project" }));

    await waitFor(() => {
      expect(screen.getAllByText("My Script").length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole("button", { name: "Add co-writer" }));
    const coWriterDialog = await screen.findByRole("dialog", { name: "Add co-writer" });
    await user.type(within(coWriterDialog).getByLabelText("Co-writer user ID"), "writer_02");
    await user.click(within(coWriterDialog).getByRole("button", { name: "Add co-writer" }));

    await waitFor(() => {
      expect(screen.getByText("writer_02")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Create draft" }));
    const draftDialog = await screen.findByRole("dialog", { name: "Create draft" });
    const scriptFile = new File(["INT. OFFICE - DAY"], "first-draft.pdf", {
      type: "application/pdf"
    });
    await user.upload(within(draftDialog).getByLabelText("Script file"), scriptFile);
    await user.click(within(draftDialog).getByRole("button", { name: "Upload + register script" }));
    await screen.findByText(/Script uploaded and registered/);
    await user.type(within(draftDialog).getByLabelText("Version label"), "v1");
    await user.click(within(draftDialog).getByRole("button", { name: "Create draft" }));

    await waitFor(() => {
      expect(uploadedScriptId).toBeTruthy();
    });
    await screen.findByText(`v1 (${uploadedScriptId})`);

    await user.click(screen.getByRole("button", { name: "Create draft" }));
    const draftDialog2 = await screen.findByRole("dialog", { name: "Create draft" });
    await user.type(within(draftDialog2).getByLabelText("Script ID"), "script_2");
    await user.type(within(draftDialog2).getByLabelText("Version label"), "v2");
    await user.click(within(draftDialog2).getByLabelText("Set as primary draft"));
    await user.click(within(draftDialog2).getByRole("button", { name: "Create draft" }));

    await screen.findByText("v2 (script_2)");

    const draftCard = screen.getByText("v2 (script_2)").closest("article");
    expect(draftCard).toBeTruthy();
    if (!draftCard) {
      return;
    }

    await user.click(within(draftCard).getByRole("button", { name: "Set primary" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/projects/project_1/drafts/draft_2/primary",
        expect.objectContaining({ method: "POST" })
      );
    });

    await user.click(within(draftCard).getByRole("button", { name: "Archive draft" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/projects/project_1/drafts/draft_2",
        expect.objectContaining({ method: "PATCH" })
      );
    });

    await user.click(screen.getByRole("button", { name: "New access request" }));
    const accessDialog = await screen.findByRole("dialog", { name: "Create script access request" });
    await user.type(within(accessDialog).getByLabelText("Requester user ID"), "writer_02");
    await user.type(within(accessDialog).getByLabelText("Reason (optional)"), "Please share for notes");
    await user.click(within(accessDialog).getByRole("button", { name: "Record request" }));

    await waitFor(() => {
      expect(screen.getAllByText("writer_02").length).toBeGreaterThan(0);
    });

    await user.type(screen.getByPlaceholderText("Decision reason (optional)"), "Looks good");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/access-requests/access_1/approve"),
        expect.objectContaining({ method: "POST" })
      );
    });

    await user.click(screen.getByRole("button", { name: "Remove co-writer" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/projects/project_1/co-writers/writer_02",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(screen.queryByText("My Script")).not.toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalled();
  });
});
