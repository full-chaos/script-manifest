"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState, type FormEvent } from "react";
import type {
  Project,
  ProjectCoWriter,
  ProjectCreateRequest,
  ProjectDraft,
  ScriptAccessRequest,
  ScriptRegisterResponse,
  ScriptUploadSessionResponse
} from "@script-manifest/contracts";
import { EmptyState } from "../components/emptyState";
import { Modal } from "../components/modal";
import { SkeletonCard } from "../components/skeleton";
import { useToast } from "../components/toast";
import { getAuthHeaders, readStoredSession } from "../lib/authSession";
import { uploadScriptViaProxy } from "../lib/scriptUpload";

type ProjectForm = {
  title: string;
  logline: string;
  synopsis: string;
  format: string;
  genre: string;
  pageCount: number;
  isDiscoverable: boolean;
};

type DraftForm = {
  scriptId: string;
  versionLabel: string;
  changeSummary: string;
  pageCount: number;
  setPrimary: boolean;
};

const initialProjectForm: ProjectForm = {
  title: "",
  logline: "",
  synopsis: "",
  format: "feature",
  genre: "drama",
  pageCount: 100,
  isDiscoverable: false
};

const initialDraftForm: DraftForm = {
  scriptId: "",
  versionLabel: "",
  changeSummary: "",
  pageCount: 100,
  setPrimary: true
};

type UploadStep = "idle" | "creating_session" | "uploading" | "registering" | "done";

const uploadStepLabels: Record<UploadStep, string> = {
  idle: "",
  creating_session: "Step 1/3: Creating upload session...",
  uploading: "Step 2/3: Uploading script file...",
  registering: "Step 3/3: Registering script...",
  done: "Upload complete."
};

function createScriptId(): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) {
    return `script_${randomId}`;
  }

  return `script_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getScriptContentType(file: File): string {
  return file.type || "application/octet-stream";
}

export default function ProjectsPage() {
  const toast = useToast();
  const [ownerUserId, setOwnerUserId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [coWriters, setCoWriters] = useState<ProjectCoWriter[]>([]);
  const [drafts, setDrafts] = useState<ProjectDraft[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [accessRequests, setAccessRequests] = useState<ScriptAccessRequest[]>([]);

  const [projectForm, setProjectForm] = useState<ProjectForm>(initialProjectForm);
  const [coWriterUserId, setCoWriterUserId] = useState("");
  const [coWriterCreditOrder, setCoWriterCreditOrder] = useState(2);
  const [draftForm, setDraftForm] = useState<DraftForm>(initialDraftForm);
  const [draftUploadFile, setDraftUploadFile] = useState<File | null>(null);
  const [scriptUploadLoading, setScriptUploadLoading] = useState(false);
  const [uploadedScriptId, setUploadedScriptId] = useState("");
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [coWriterModalOpen, setCoWriterModalOpen] = useState(false);
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [accessRequestModalOpen, setAccessRequestModalOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [contextLoading, setContextLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [requesterUserId, setRequesterUserId] = useState("");
  const [accessRequestReason, setAccessRequestReason] = useState("");
  const [decisionReason, setDecisionReason] = useState("");

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  useEffect(() => {
    const session = readStoredSession();
    if (!session) {
      setStatus("Sign in to load your projects.");
      setInitialLoading(false);
      return;
    }

    setOwnerUserId(session.user.id);
    void loadProjects(session.user.id);
  }, []);

  async function loadProjectContext(projectId: string) {
    if (!projectId) {
      setCoWriters([]);
      setDrafts([]);
      setAccessRequests([]);
      setSelectedScriptId("");
      return;
    }

    setContextLoading(true);
    try {
      const authHeaders = getAuthHeaders();
      const [coWritersResponse, draftsResponse] = await Promise.all([
        fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/co-writers`, { cache: "no-store", headers: authHeaders }),
        fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/drafts`, { cache: "no-store", headers: authHeaders })
      ]);
      const [coWritersBody, draftsBody] = await Promise.all([
        coWritersResponse.json(),
        draftsResponse.json()
      ]);

      if (!coWritersResponse.ok || !draftsResponse.ok) {
        toast.error("Failed to load co-writers or drafts.");
        return;
      }

      setCoWriters(coWritersBody.coWriters as ProjectCoWriter[]);
      const nextDrafts = draftsBody.drafts as ProjectDraft[];
      setDrafts(nextDrafts);
      const primaryDraft = nextDrafts.find((draft) => draft.isPrimary && draft.lifecycleState === "active");
      const fallbackDraft = nextDrafts.find((draft) => draft.lifecycleState === "active") ?? nextDrafts[0];
      const nextScriptId = primaryDraft?.scriptId ?? fallbackDraft?.scriptId ?? "";
      setSelectedScriptId(nextScriptId);
      await loadAccessRequests(nextScriptId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load project context.");
    } finally {
      setContextLoading(false);
    }
  }

  async function loadAccessRequests(scriptId: string) {
    if (!scriptId) {
      setAccessRequests([]);
      return;
    }

    try {
      const response = await fetch(
        `/api/v1/scripts/${encodeURIComponent(scriptId)}/access-requests?ownerUserId=${encodeURIComponent(ownerUserId)}`,
        { cache: "no-store", headers: getAuthHeaders() }
      );
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error ? `${body.error as string}` : "Unable to load access requests.");
        return;
      }

      setAccessRequests((body.accessRequests as ScriptAccessRequest[]) ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load access requests.");
    }
  }

  async function createAccessRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedScriptId) {
      toast.error("Select a script before creating an access request.");
      return;
    }
    if (!requesterUserId.trim()) {
      toast.error("Requester user ID is required.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/scripts/${encodeURIComponent(selectedScriptId)}/access-requests`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            requesterUserId: requesterUserId.trim(),
            ownerUserId: ownerUserId,
            reason: accessRequestReason.trim() || undefined
          })
        }
      );
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error ? `${body.error as string}` : "Unable to create access request.");
        return;
      }

      setRequesterUserId("");
      setAccessRequestReason("");
      setAccessRequestModalOpen(false);
      await loadAccessRequests(selectedScriptId);
      toast.success("Access request recorded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create access request.");
    } finally {
      setLoading(false);
    }
  }

  async function decideAccessRequest(requestId: string, action: "approve" | "reject") {
    if (!selectedScriptId) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/scripts/${encodeURIComponent(selectedScriptId)}/access-requests/${encodeURIComponent(requestId)}/${action}`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            decisionReason: decisionReason.trim() || undefined
          })
        }
      );
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error ? `${body.error as string}` : `Unable to ${action} access request.`);
        return;
      }

      await loadAccessRequests(selectedScriptId);
      setDecisionReason("");
      toast.success(`Access request ${action}d.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} access request.`);
    } finally {
      setLoading(false);
    }
  }

  async function selectProject(projectId: string) {
    setSelectedProjectId(projectId);
    await loadProjectContext(projectId);
  }

  async function loadProjects(explicitOwnerId?: string) {
    const targetOwnerId = explicitOwnerId ?? ownerUserId;
    if (!targetOwnerId.trim()) {
      setStatus("Sign in to load your projects.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/projects?ownerUserId=${encodeURIComponent(targetOwnerId)}`,
        { cache: "no-store", headers: getAuthHeaders() }
      );
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error ? `${body.error as string}` : "Unable to load projects.");
        return;
      }

      const rows = body.projects as Project[];
      setProjects(rows);
      const stillSelected = rows.some((project) => project.id === selectedProjectId);
      const nextSelected = stillSelected ? selectedProjectId : (rows[0]?.id ?? "");
      setSelectedProjectId(nextSelected);
      await loadProjectContext(nextSelected);
      setStatus(`Loaded ${rows.length as number} projects.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load projects.");
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerUserId.trim()) {
      toast.error("Owner ID is required.");
      return;
    }

    setLoading(true);

    const payload: ProjectCreateRequest = {
      title: projectForm.title,
      logline: projectForm.logline,
      synopsis: projectForm.synopsis,
      format: projectForm.format,
      genre: projectForm.genre,
      pageCount: Number.isFinite(projectForm.pageCount) ? projectForm.pageCount : 0,
      isDiscoverable: projectForm.isDiscoverable
    };

    try {
      const response = await fetch("/api/v1/projects", {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error ? `${body.error as string}` : "Unable to create project.");
        return;
      }

      const created = body.project as Project;
      setProjectForm(initialProjectForm);
      setProjectModalOpen(false);
      setProjects((current) => [created, ...current]);
      await selectProject(created.id);
      toast.success("Project created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create project.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteProject(projectId: string) {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        const body = await response.json();
        toast.error(body.error ? `${body.error as string}` : "Delete failed.");
        return;
      }

      const remaining = projects.filter((project) => project.id !== projectId);
      setProjects(remaining);
      if (selectedProjectId === projectId) {
        const next = remaining[0]?.id ?? "";
        setSelectedProjectId(next);
        await loadProjectContext(next);
      }
      toast.success("Project deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete project.");
    } finally {
      setLoading(false);
    }
  }

  async function addCoWriter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId || !coWriterUserId.trim()) {
      toast.error("Select a project and provide a co-writer user ID.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/projects/${encodeURIComponent(selectedProjectId)}/co-writers`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            coWriterUserId,
            creditOrder: Number.isFinite(coWriterCreditOrder) ? coWriterCreditOrder : 1
          })
        }
      );
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error ? `${body.error as string}` : "Unable to add co-writer.");
        return;
      }

      setCoWriterUserId("");
      setCoWriterCreditOrder(2);
      setCoWriterModalOpen(false);
      await loadProjectContext(selectedProjectId);
      toast.success("Co-writer added.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add co-writer.");
    } finally {
      setLoading(false);
    }
  }

  async function removeCoWriter(coWriterId: string) {
    if (!selectedProjectId) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/projects/${encodeURIComponent(selectedProjectId)}/co-writers/${encodeURIComponent(coWriterId)}`,
        { method: "DELETE", headers: getAuthHeaders() }
      );
      if (!response.ok) {
        const body = await response.json();
        toast.error(body.error ? `${body.error as string}` : "Unable to remove co-writer.");
        return;
      }

      await loadProjectContext(selectedProjectId);
      toast.success("Co-writer removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove co-writer.");
    } finally {
      setLoading(false);
    }
  }

  async function uploadAndRegisterScript() {
    if (!ownerUserId.trim()) {
      toast.error("Sign in to upload scripts.");
      return;
    }

    if (!draftUploadFile) {
      toast.error("Select a script file before uploading.");
      return;
    }

    const scriptId = createScriptId();
    const contentType = getScriptContentType(draftUploadFile);
    setScriptUploadLoading(true);
    setUploadStep("creating_session");

    try {
      const uploadSessionResponse = await fetch("/api/v1/scripts/upload-session", {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          scriptId,
          ownerUserId,
          filename: draftUploadFile.name,
          contentType,
          size: draftUploadFile.size
        })
      });
      const uploadSessionBody = (await uploadSessionResponse.json()) as
        | ScriptUploadSessionResponse
        | { error?: string };

      if (!uploadSessionResponse.ok) {
        toast.error(
          "error" in uploadSessionBody && uploadSessionBody.error
            ? `${uploadSessionBody.error}`
            : "Unable to create script upload session."
        );
        return;
      }

      setUploadStep("uploading");
      const uploadSession = uploadSessionBody as ScriptUploadSessionResponse;
      const uploadResponse = await uploadScriptViaProxy({
        session: uploadSession,
        file: draftUploadFile,
        headers: getAuthHeaders()
      });
      if (!uploadResponse.ok) {
        const detail = await uploadResponse.text();
        toast.error(detail ? `Upload failed: ${detail}` : "Upload failed.");
        return;
      }

      setUploadStep("registering");
      const registerResponse = await fetch("/api/v1/scripts/register", {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          scriptId,
          ownerUserId,
          objectKey: uploadSession.objectKey,
          filename: draftUploadFile.name,
          contentType,
          size: draftUploadFile.size
        })
      });
      const registerBody = (await registerResponse.json()) as
        | ScriptRegisterResponse
        | { error?: string };
      if (!registerResponse.ok) {
        toast.error(
          "error" in registerBody && registerBody.error
            ? `${registerBody.error}`
            : "Unable to register uploaded script."
        );
        return;
      }

      const registerPayload = registerBody as ScriptRegisterResponse;
      const nextScriptId = registerPayload.script.scriptId;
      setDraftForm((current) => ({ ...current, scriptId: nextScriptId }));
      setUploadedScriptId(nextScriptId);
      setUploadStep("done");
      toast.success(`Script uploaded and registered (${nextScriptId}).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Script upload failed.");
    } finally {
      setScriptUploadLoading(false);
    }
  }

  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId || !ownerUserId) {
      toast.error("Select a project and sign in first.");
      return;
    }
    if (!draftForm.scriptId.trim()) {
      toast.error("Upload/register a script or enter a script ID first.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/v1/projects/${encodeURIComponent(selectedProjectId)}/drafts`, {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          scriptId: draftForm.scriptId,
          versionLabel: draftForm.versionLabel,
          changeSummary: draftForm.changeSummary,
          pageCount: Number.isFinite(draftForm.pageCount) ? draftForm.pageCount : 0,
          setPrimary: draftForm.setPrimary
        })
      });
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error ? `${body.error as string}` : "Unable to create draft.");
        return;
      }

      setDraftForm(initialDraftForm);
      setDraftUploadFile(null);
      setUploadedScriptId("");
      setUploadStep("idle");
      setDraftModalOpen(false);
      await loadProjectContext(selectedProjectId);
      toast.success("Draft created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create draft.");
    } finally {
      setLoading(false);
    }
  }

  async function setPrimaryDraft(draftId: string) {
    if (!selectedProjectId || !ownerUserId) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/projects/${encodeURIComponent(selectedProjectId)}/drafts/${encodeURIComponent(draftId)}/primary`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...getAuthHeaders() }
        }
      );
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error ? `${body.error as string}` : "Unable to set primary draft.");
        return;
      }

      await loadProjectContext(selectedProjectId);
      toast.success("Primary draft updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to set primary draft.");
    } finally {
      setLoading(false);
    }
  }

  async function archiveDraft(draftId: string) {
    if (!selectedProjectId) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/projects/${encodeURIComponent(selectedProjectId)}/drafts/${encodeURIComponent(draftId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ lifecycleState: "archived" })
        }
      );
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error ? `${body.error as string}` : "Unable to archive draft.");
        return;
      }

      await loadProjectContext(selectedProjectId);
      toast.success("Draft archived.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive draft.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--sky animate-in">
        <p className="eyebrow eyebrow--sky">Project Workspace</p>
        <h1 className="text-4xl text-ink-900">Your script workspace</h1>
        <p className="max-w-3xl text-ink-700">
          Manage projects, co-writers, and draft versions in one place. Upload scripts, track
          lifecycle transitions, and control access — all from a single dashboard.
        </p>
        <div className="inline-form">
          <span className="badge">{ownerUserId ? `ID: ${ownerUserId}` : "Not signed in"}</span>
          <button type="button" className="btn btn-secondary" onClick={() => void loadProjects()} disabled={loading || !ownerUserId}>
            {loading ? "Refreshing..." : "Refresh projects"}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setProjectModalOpen(true)} disabled={!ownerUserId}>
            Create project
          </button>
        </div>
      </article>

      {!ownerUserId ? (
        <EmptyState
          icon="🔐"
          title="Sign in to manage projects"
          description="Create an account or sign in to start building your script portfolio."
          actionLabel="Sign in"
          actionHref={"/signin" as Route}
        />
      ) : null}

      <article className="panel stack">
        <div className="subcard-header">
          <h2 className="section-title">Your Projects</h2>
          <span className="badge">{projects.length} total</span>
        </div>

        {initialLoading && ownerUserId ? (
          <div className="grid gap-3 md:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon="📁"
            title="No projects yet"
            description="Create your first project to start managing scripts, drafts, and co-writers."
            onAction={() => setProjectModalOpen(true)}
            actionLabel="Create project"
          />
        ) : null}

        {!initialLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {projects.map((project) => {
              const active = project.id === selectedProjectId;
              return (
                <article
                  key={project.id}
                  className={
                    active
                      ? "subcard border-ember-500/60 bg-ember-500/10"
                      : "subcard"
                  }
                >
                  <div className="subcard-header">
                    <strong className="text-lg text-ink-900">{project.title}</strong>
                    <span className="badge">{project.format}</span>
                  </div>
                  <p className="mt-2 text-sm text-ink-700">{project.logline || "No logline provided."}</p>
                  <p className="muted mt-2">
                    {project.genre} | {project.pageCount} pages | {project.isDiscoverable ? "Discoverable" : "Private"}
                  </p>
                  <div className="inline-form mt-3">
                    <button
                      type="button"
                      className={active ? "btn btn-primary" : "btn btn-secondary"}
                      onClick={() => void selectProject(project.id)}
                      disabled={contextLoading}
                    >
                      {active ? "Selected" : "Select"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => void deleteProject(project.id)}
                      disabled={loading}
                    >
                      Delete
                    </button>
                  </div>
                  <p className="muted mt-2">
                    Viewer scaffold: <Link href="/projects/script_demo_01/viewer">open demo script viewer</Link>
                  </p>
                </article>
              );
            })}
          </div>
        ) : null}
      </article>

      <article className="panel stack">
        <div className="subcard-header">
          <h2 className="section-title">Selected Project Context</h2>
          {selectedProject ? <span className="stat-chip">{selectedProject.title}</span> : null}
        </div>

        {!selectedProject ? (
          <EmptyState
            icon="👆"
            title="Select a project"
            description="Choose a project above to manage its co-writers, drafts, and access requests."
          />
        ) : (
          <div className="stack">
            <section className="grid gap-3 md:grid-cols-2">
              <article className="subcard stack">
                <div className="subcard-header">
                  <h3 className="text-2xl text-ink-900">Co-Writers</h3>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setCoWriterModalOpen(true)}
                    disabled={loading || contextLoading}
                  >
                    Add co-writer
                  </button>
                </div>

                {coWriters.length === 0 ? <p className="muted">No co-writers added.</p> : null}
                {coWriters.map((coWriter) => (
                  <article key={coWriter.coWriterUserId} className="rounded-xl border border-zinc-300/60 bg-white p-3">
                    <div className="subcard-header">
                      <strong>{coWriter.coWriterUserId}</strong>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => void removeCoWriter(coWriter.coWriterUserId)}
                        disabled={loading || contextLoading}
                      >
                        Remove co-writer
                      </button>
                    </div>
                    <p className="muted">Credit order: {coWriter.creditOrder}</p>
                  </article>
                ))}
              </article>

              <article className="subcard stack">
                <div className="subcard-header">
                  <h3 className="text-2xl text-ink-900">Draft Lifecycle</h3>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setDraftModalOpen(true)}
                    disabled={loading || contextLoading}
                  >
                    Create draft
                  </button>
                </div>

                {drafts.length === 0 ? <p className="muted">No drafts added yet.</p> : null}
                {drafts.map((draft) => (
                  <article key={draft.id} className="rounded-xl border border-zinc-300/60 bg-white p-3">
                    <div className="subcard-header">
                      <strong>
                        {draft.versionLabel} ({draft.scriptId})
                      </strong>
                      <span className="badge">
                        {draft.lifecycleState}
                        {draft.isPrimary ? " | primary" : ""}
                      </span>
                    </div>
                    {draft.changeSummary ? <p className="mt-2 text-sm text-ink-700">{draft.changeSummary}</p> : null}
                    <p className="muted mt-2">{draft.pageCount} pages</p>
                    <div className="inline-form mt-3">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => void setPrimaryDraft(draft.id)}
                        disabled={loading || contextLoading || draft.lifecycleState === "archived" || draft.isPrimary}
                      >
                        Set primary
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => void archiveDraft(draft.id)}
                        disabled={loading || contextLoading || draft.lifecycleState === "archived"}
                      >
                        Archive draft
                      </button>
                      <button
                        type="button"
                        className={selectedScriptId === draft.scriptId ? "btn btn-primary" : "btn btn-secondary"}
                        onClick={() => {
                          setSelectedScriptId(draft.scriptId);
                          void loadAccessRequests(draft.scriptId);
                        }}
                        disabled={loading || contextLoading}
                      >
                        {selectedScriptId === draft.scriptId ? "Tracking access" : "Track access"}
                      </button>
                    </div>
                  </article>
                ))}
              </article>
            </section>

            <div className="subcard-header">
              <h3 className="text-2xl text-ink-900">Script Access Workflow + Audit Trail</h3>
              <span className="badge">Script: {selectedScriptId || "Select a draft"}</span>
            </div>

            <article className="subcard stack">
              <div className="inline-form">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setAccessRequestModalOpen(true)}
                  disabled={!selectedScriptId || loading || contextLoading}
                >
                  New access request
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void loadAccessRequests(selectedScriptId)}
                  disabled={loading || contextLoading}
                >
                  Refresh access log
                </button>
              </div>
              {!selectedScriptId ? (
                <EmptyState
                  icon="🔒"
                  title="Select a draft"
                  description="Pick a draft and click 'Track access' to load audit entries."
                />
              ) : null}
              {selectedScriptId && accessRequests.length === 0 ? (
                <EmptyState
                  icon="📋"
                  title="No access requests"
                  description="No one has requested access to this script yet."
                />
              ) : null}
              {accessRequests.map((entry) => (
                <article key={entry.id} className="rounded-xl border border-zinc-300/60 bg-white p-3">
                  <div className="subcard-header">
                    <strong>{entry.requesterUserId}</strong>
                    <span className="badge">{entry.status}</span>
                  </div>
                  <p className="muted mt-2">Requested: {new Date(entry.requestedAt).toLocaleString()}</p>
                  {entry.reason ? <p className="mt-2 text-sm text-ink-700">{entry.reason}</p> : null}
                  {entry.status === "pending" ? (
                    <div className="inline-form mt-3">
                      <input
                        className="input md:w-96"
                        value={decisionReason}
                        onChange={(event) => setDecisionReason(event.target.value)}
                        placeholder="Decision reason (optional)"
                      />
                      <button type="button" className="btn btn-primary" onClick={() => void decideAccessRequest(entry.id, "approve")} disabled={loading}>
                        Approve
                      </button>
                      <button type="button" className="btn btn-danger" onClick={() => void decideAccessRequest(entry.id, "reject")} disabled={loading}>
                        Reject
                      </button>
                    </div>
                  ) : null}
                  {entry.decidedAt ? (
                    <p className="muted mt-2">
                      Decision: {entry.decisionReason || "No reason provided"} ({new Date(entry.decidedAt).toLocaleString()})
                    </p>
                  ) : null}
                </article>
              ))}
            </article>
          </div>
        )}
      </article>

      <Modal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        title="Create project"
        description="Start a new script project and set its default metadata."
      >
        <form className="stack" onSubmit={createProject}>
          <label className="stack-tight">
            <span>Title</span>
            <input
              className="input"
              value={projectForm.title}
              onChange={(event) =>
                setProjectForm((current) => ({ ...current, title: event.target.value }))
              }
              required
            />
          </label>

          <label className="stack-tight">
            <span>Logline</span>
            <input
              className="input"
              value={projectForm.logline}
              onChange={(event) =>
                setProjectForm((current) => ({ ...current, logline: event.target.value }))
              }
            />
          </label>

          <label className="stack-tight">
            <span>Synopsis</span>
            <textarea
              className="input textarea"
              rows={4}
              value={projectForm.synopsis}
              onChange={(event) =>
                setProjectForm((current) => ({ ...current, synopsis: event.target.value }))
              }
            />
          </label>

          <div className="grid-two">
            <label className="stack-tight">
              <span>Format</span>
              <input
                className="input"
                value={projectForm.format}
                onChange={(event) =>
                  setProjectForm((current) => ({ ...current, format: event.target.value }))
                }
                required
              />
            </label>

            <label className="stack-tight">
              <span>Genre</span>
              <input
                className="input"
                value={projectForm.genre}
                onChange={(event) =>
                  setProjectForm((current) => ({ ...current, genre: event.target.value }))
                }
                required
              />
            </label>
          </div>

          <div className="grid-two">
            <label className="stack-tight">
              <span>Page count</span>
              <input
                className="input"
                type="number"
                min={0}
                value={projectForm.pageCount}
                onChange={(event) =>
                  setProjectForm((current) => ({
                    ...current,
                    pageCount: Number(event.target.value)
                  }))
                }
              />
            </label>

            <label className="stack-tight checkbox">
              <input
                type="checkbox"
                checked={projectForm.isDiscoverable}
                onChange={(event) =>
                  setProjectForm((current) => ({
                    ...current,
                    isDiscoverable: event.target.checked
                  }))
                }
              />
              <span>Discoverable</span>
            </label>
          </div>

          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Saving..." : "Create project"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={coWriterModalOpen}
        onClose={() => setCoWriterModalOpen(false)}
        title="Add co-writer"
        description="Assign a co-writer and credit order for the selected project."
      >
        <form className="stack" onSubmit={addCoWriter}>
          <div className="grid-two">
            <label className="stack-tight">
              <span>Co-writer user ID</span>
              <input
                className="input"
                value={coWriterUserId}
                onChange={(event) => setCoWriterUserId(event.target.value)}
                required
              />
            </label>
            <label className="stack-tight">
              <span>Credit order</span>
              <input
                className="input"
                type="number"
                min={1}
                value={coWriterCreditOrder}
                onChange={(event) => setCoWriterCreditOrder(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={loading || contextLoading}>
              Add co-writer
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={draftModalOpen}
        onClose={() => setDraftModalOpen(false)}
        title="Create draft"
        description="Add a new version and optionally mark it as the primary draft."
      >
        <form className="stack" onSubmit={createDraft}>
          <label className="stack-tight">
            <span>Script file</span>
            <input
              className="input"
              type="file"
              accept=".pdf,.txt,.fdx,.doc,.docx"
              onChange={(event) => setDraftUploadFile(event.target.files?.[0] ?? null)}
            />
          </label>

          <div className="inline-form">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void uploadAndRegisterScript()}
              disabled={
                loading ||
                contextLoading ||
                scriptUploadLoading ||
                !draftUploadFile
              }
            >
              {scriptUploadLoading ? "Uploading script..." : "Upload + register script"}
            </button>
            {uploadedScriptId ? <span className="badge">Uploaded: {uploadedScriptId}</span> : null}
          </div>

          {uploadStep !== "idle" && uploadStep !== "done" ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-tide-700">{uploadStepLabels[uploadStep]}</p>
              <div className="h-2 overflow-hidden rounded-full bg-cream-200">
                <div
                  className="h-full rounded-full bg-tide-500 transition-all duration-500"
                  style={{
                    width:
                      uploadStep === "creating_session"
                        ? "33%"
                        : uploadStep === "uploading"
                          ? "66%"
                          : "100%"
                  }}
                />
              </div>
            </div>
          ) : null}

          <div className="grid-two">
            <label className="stack-tight">
              <span>Script ID</span>
              <input
                className="input"
                value={draftForm.scriptId}
                onChange={(event) =>
                  setDraftForm((current) => ({ ...current, scriptId: event.target.value }))
                }
                required
              />
            </label>
            <label className="stack-tight">
              <span>Version label</span>
              <input
                className="input"
                value={draftForm.versionLabel}
                onChange={(event) =>
                  setDraftForm((current) => ({ ...current, versionLabel: event.target.value }))
                }
                required
              />
            </label>
          </div>

          <label className="stack-tight">
            <span>Change summary</span>
            <textarea
              className="input textarea"
              rows={3}
              value={draftForm.changeSummary}
              onChange={(event) =>
                setDraftForm((current) => ({ ...current, changeSummary: event.target.value }))
              }
            />
          </label>

          <div className="grid-two">
            <label className="stack-tight">
              <span>Page count</span>
              <input
                className="input"
                type="number"
                min={0}
                value={draftForm.pageCount}
                onChange={(event) =>
                  setDraftForm((current) => ({
                    ...current,
                    pageCount: Number(event.target.value)
                  }))
                }
              />
            </label>
            <label className="stack-tight checkbox">
              <input
                type="checkbox"
                checked={draftForm.setPrimary}
                onChange={(event) =>
                  setDraftForm((current) => ({ ...current, setPrimary: event.target.checked }))
                }
              />
              <span>Set as primary draft</span>
            </label>
          </div>

          <div className="inline-form">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || contextLoading || scriptUploadLoading}
            >
              Create draft
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={accessRequestModalOpen}
        onClose={() => setAccessRequestModalOpen(false)}
        title="Create script access request"
        description="Record a new access request and track approvals/rejections in the project audit trail."
      >
        <form className="stack" onSubmit={createAccessRequest}>
          <label className="stack-tight">
            <span>Script ID</span>
            <input className="input" value={selectedScriptId} disabled readOnly />
          </label>

          <label className="stack-tight">
            <span>Requester user ID</span>
            <input
              className="input"
              value={requesterUserId}
              onChange={(event) => setRequesterUserId(event.target.value)}
              placeholder="writer_02"
              required
            />
          </label>

          <label className="stack-tight">
            <span>Reason (optional)</span>
            <textarea
              className="input textarea"
              rows={3}
              maxLength={500}
              value={accessRequestReason}
              onChange={(event) => setAccessRequestReason(event.target.value)}
              placeholder="Requesting read access for review."
            />
          </label>

          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={loading || !selectedScriptId}>
              Record request
            </button>
          </div>
        </form>
      </Modal>

      {status ? <p className={status.startsWith("Error:") ? "status-error" : "status-note"}>{status}</p> : null}
    </section>
  );
}
