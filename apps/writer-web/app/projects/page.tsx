"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState, type FormEvent } from "react";
import type {
  Project,
  ProjectCoWriter,
  ProjectCreateRequest,
  ProjectDraft,
  ScriptAccessRequest,
  ScriptRegisterResponse
} from "@script-manifest/contracts";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { EmptyState } from "../components/emptyState";
import { Modal } from "../components/modal";
import { RecommendedCompetitions } from "../components/RecommendedCompetitions";
import { SkeletonCard } from "../components/skeleton";
import { useToast } from "../components/toast";
import { useAuth } from "../lib/AuthProvider";
import { fetcher, ApiError } from "../lib/fetcher";
import { type ScriptUploadProxyResponse, uploadScriptViaProxy } from "../lib/scriptUpload";

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
  const { user, loading: authLoading } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [mutating, setMutating] = useState(false);

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

  const [requesterUserId, setRequesterUserId] = useState("");
  const [accessRequestReason, setAccessRequestReason] = useState("");
  const [decisionReason, setDecisionReason] = useState("");

  // Auth-paused key: null while auth is resolving or no user — SWR will not fetch.
  const ownerUserId = user?.id ?? "";
  const authPausedBase = authLoading || !ownerUserId ? null : ownerUserId;

  const projectsKey = authPausedBase
    ? `/api/v1/projects?ownerUserId=${encodeURIComponent(ownerUserId)}`
    : null;
  const coWritersKey = selectedProjectId
    ? `/api/v1/projects/${encodeURIComponent(selectedProjectId)}/co-writers`
    : null;
  const draftsKey = selectedProjectId
    ? `/api/v1/projects/${encodeURIComponent(selectedProjectId)}/drafts`
    : null;
  const accessRequestsKey =
    selectedScriptId && ownerUserId
      ? `/api/v1/scripts/${encodeURIComponent(selectedScriptId)}/access-requests?ownerUserId=${encodeURIComponent(ownerUserId)}`
      : null;

  const {
    data: projectsData,
    isLoading: projectsLoading,
    mutate: mutateProjects,
  } = useSWR<{ projects: Project[] }>(projectsKey, {
    onSuccess(data) {
      const rows = data.projects;
      setSelectedProjectId((cur) => {
        const stillSelected = rows.some((p) => p.id === cur);
        return stillSelected ? cur : (rows[0]?.id ?? "");
      });
    },
    onError(err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load projects.");
    },
  });

  const {
    data: coWritersData,
    isLoading: coWritersLoading,
    mutate: mutateCoWriters,
  } = useSWR<{ coWriters: ProjectCoWriter[] }>(coWritersKey, {
    onError(err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load co-writers.");
    },
  });

  const {
    data: draftsData,
    isLoading: draftsLoading,
    mutate: mutateDrafts,
  } = useSWR<{ drafts: ProjectDraft[] }>(draftsKey, {
    onSuccess(data) {
      const nextDrafts = data.drafts;
      const primary = nextDrafts.find((d) => d.isPrimary && d.lifecycleState === "active");
      const fallback = nextDrafts.find((d) => d.lifecycleState === "active") ?? nextDrafts[0];
      const scriptId = primary?.scriptId ?? fallback?.scriptId ?? "";
      setSelectedScriptId(scriptId);
    },
    onError(err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load drafts.");
    },
  });

  const {
    data: accessRequestsData,
    isLoading: accessRequestsLoading,
    mutate: mutateAccessRequests,
  } = useSWR<{ accessRequests: ScriptAccessRequest[] }>(accessRequestsKey, {
    onError(err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load access requests.");
    },
  });

  const projects = projectsData?.projects ?? [];
  const coWriters = coWritersData?.coWriters ?? [];
  const drafts = draftsData?.drafts ?? [];
  const accessRequests = accessRequestsData?.accessRequests ?? [];
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const isInitialLoading = projectsLoading && !!ownerUserId;
  const contextLoading = coWritersLoading || draftsLoading || accessRequestsLoading;

  const { trigger: triggerCreateProject, isMutating: projectCreating } = useSWRMutation(
    projectsKey,
    async (_key: string | null, { arg }: { arg: ProjectCreateRequest }) =>
      fetcher<{ project: Project }>("/api/v1/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(arg),
      }),
    {
      populateCache: false,
      throwOnError: false,
      onSuccess(data) {
        const created = data.project;
        void mutateProjects(
          (cur) => ({ projects: [created, ...(cur?.projects ?? [])] }),
          { revalidate: false }
        );
        setProjectForm(initialProjectForm);
        setProjectModalOpen(false);
        setSelectedProjectId(created.id);
        setSelectedScriptId("");
        toast.success("Project created.");
        void fetch("/api/v1/onboarding-progress", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectAdded: true }),
        }).catch(() => {});
      },
      onError(err: unknown) {
        toast.error(err instanceof ApiError ? err.message : "Failed to create project.");
      },
    }
  );

  function selectProject(projectId: string) {
    setSelectedProjectId(projectId);
    setSelectedScriptId(""); // will be re-initialized when drafts load via onSuccess
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerUserId.trim()) {
      toast.error("Owner ID is required.");
      return;
    }

    const payload: ProjectCreateRequest = {
      title: projectForm.title,
      logline: projectForm.logline,
      synopsis: projectForm.synopsis,
      format: projectForm.format,
      genre: projectForm.genre,
      pageCount: Number.isFinite(projectForm.pageCount) ? projectForm.pageCount : 0,
      isDiscoverable: projectForm.isDiscoverable
    };

    await triggerCreateProject(payload);
  }

  async function deleteProject(projectId: string) {
    setMutating(true);
    try {
      const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}`, {
        method: "DELETE",
        headers: {}
      });
      if (!response.ok) {
        const body = await response.json();
        toast.error(body.error ? `${body.error as string}` : "Delete failed.");
        return;
      }

      const remaining = projects.filter((project) => project.id !== projectId);
      void mutateProjects({ projects: remaining }, { revalidate: false });
      if (selectedProjectId === projectId) {
        const next = remaining[0]?.id ?? "";
        setSelectedProjectId(next);
        setSelectedScriptId("");
      }
      toast.success("Project deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete project.");
    } finally {
      setMutating(false);
    }
  }

  async function addCoWriter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId || !coWriterUserId.trim()) {
      toast.error("Select a project and provide a co-writer user ID.");
      return;
    }

    setMutating(true);
    try {
      const response = await fetch(
        `/api/v1/projects/${encodeURIComponent(selectedProjectId)}/co-writers`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...{} },
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
      void mutateCoWriters();
      toast.success("Co-writer added.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add co-writer.");
    } finally {
      setMutating(false);
    }
  }

  async function removeCoWriter(coWriterId: string) {
    if (!selectedProjectId) {
      return;
    }

    setMutating(true);
    try {
      const response = await fetch(
        `/api/v1/projects/${encodeURIComponent(selectedProjectId)}/co-writers/${encodeURIComponent(coWriterId)}`,
        { method: "DELETE", headers: {} }
      );
      if (!response.ok) {
        const body = await response.json();
        toast.error(body.error ? `${body.error as string}` : "Unable to remove co-writer.");
        return;
      }

      void mutateCoWriters();
      toast.success("Co-writer removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove co-writer.");
    } finally {
      setMutating(false);
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
      setUploadStep("uploading");
      const uploadResponse = await uploadScriptViaProxy({
        scriptId,
        ownerUserId,
        file: draftUploadFile,
        contentType,
        headers: {}
      });

      if (!uploadResponse.ok) {
        const detailPayload = (await uploadResponse.json().catch(async () => ({
          detail: await uploadResponse.text()
        }))) as { detail?: string; error?: string };
        toast.error(detailPayload.detail ?? detailPayload.error ?? "File upload failed.");
        return;
      }

      const uploadBody = (await uploadResponse.json()) as ScriptUploadProxyResponse;

      setUploadStep("registering");
      const registerResponse = await fetch("/api/v1/scripts/register", {
        method: "POST",
        headers: { "content-type": "application/json", ...{} },
        body: JSON.stringify({
          scriptId,
          ownerUserId,
          objectKey: uploadBody.objectKey,
          filename: draftUploadFile.name,
          contentType,
          size: draftUploadFile.size
        })
      });
      const registerBody = (await registerResponse.json()) as ScriptRegisterResponse | { error?: string };
      if (!registerResponse.ok) {
        toast.error("error" in registerBody && registerBody.error ? registerBody.error : "Failed to register script.");
        return;
      }

      const registeredId = (registerBody as ScriptRegisterResponse).script.scriptId;
      setUploadedScriptId(registeredId);
      setDraftForm((current) => ({ ...current, scriptId: registeredId }));
      setUploadStep("done");
      toast.success("Script uploaded and registered.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setScriptUploadLoading(false);
    }
  }

  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId) {
      toast.error("Select a project first.");
      return;
    }

    setMutating(true);
    try {
      const response = await fetch(`/api/v1/projects/${encodeURIComponent(selectedProjectId)}/drafts`, {
        method: "POST",
        headers: { "content-type": "application/json", ...{} },
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
      void mutateDrafts();
      toast.success("Draft created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create draft.");
    } finally {
      setMutating(false);
    }
  }

  async function setPrimaryDraft(draftId: string) {
    if (!selectedProjectId || !ownerUserId) {
      return;
    }

    setMutating(true);
    try {
      const response = await fetch(
        `/api/v1/projects/${encodeURIComponent(selectedProjectId)}/drafts/${encodeURIComponent(draftId)}/primary`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...{} }
        }
      );
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error ? `${body.error as string}` : "Unable to set primary draft.");
        return;
      }

      void mutateDrafts();
      toast.success("Primary draft updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to set primary draft.");
    } finally {
      setMutating(false);
    }
  }

  async function archiveDraft(draftId: string) {
    if (!selectedProjectId) {
      return;
    }

    setMutating(true);
    try {
      const response = await fetch(
        `/api/v1/projects/${encodeURIComponent(selectedProjectId)}/drafts/${encodeURIComponent(draftId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json", ...{} },
          body: JSON.stringify({ lifecycleState: "archived" })
        }
      );
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error ? `${body.error as string}` : "Unable to archive draft.");
        return;
      }

      void mutateDrafts();
      toast.success("Draft archived.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive draft.");
    } finally {
      setMutating(false);
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

    setMutating(true);
    try {
      const response = await fetch(
        `/api/v1/scripts/${encodeURIComponent(selectedScriptId)}/access-requests`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...{} },
          body: JSON.stringify({
            requesterUserId: requesterUserId.trim(),
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
      void mutateAccessRequests();
      toast.success("Access request recorded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create access request.");
    } finally {
      setMutating(false);
    }
  }

  async function decideAccessRequest(requestId: string, action: "approve" | "reject") {
    if (!selectedScriptId) {
      return;
    }

    setMutating(true);
    try {
      const response = await fetch(
        `/api/v1/scripts/${encodeURIComponent(selectedScriptId)}/access-requests/${encodeURIComponent(requestId)}/${action}`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...{} },
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

      void mutateAccessRequests();
      setDecisionReason("");
      toast.success(`Access request ${action}d.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} access request.`);
    } finally {
      setMutating(false);
    }
  }

  const loading = projectCreating || mutating;

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--sky animate-in">
        <p className="eyebrow eyebrow--sky">Project Workspace</p>
        <h1 className="text-4xl text-foreground">Your script workspace</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Manage projects, co-writers, and draft versions in one place. Upload scripts, track
          lifecycle transitions, and control access — all from a single dashboard.
        </p>
        <div className="inline-form">
          <span className="badge">{ownerUserId ? `ID: ${ownerUserId}` : "Not signed in"}</span>
          <button type="button" className="btn btn-secondary" onClick={() => void mutateProjects()} disabled={loading || !ownerUserId}>
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

        {isInitialLoading ? (
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

        {!isInitialLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {projects.map((project) => {
              const active = project.id === selectedProjectId;
              return (
                <article
                  key={project.id}
                  className={
                    active
                      ? "subcard border-ember-500/60 bg-primary/15"
                      : "subcard"
                  }
                >
                  <div className="subcard-header">
                    <strong className="text-lg text-foreground">{project.title}</strong>
                    <span className="badge">{project.format}</span>
                  </div>
                  <p className="mt-2 text-sm text-foreground-secondary">{project.logline || "No logline provided."}</p>
                  <p className="muted mt-2">
                    {project.genre} | {project.pageCount} pages | {project.isDiscoverable ? "Discoverable" : "Private"}
                  </p>
                  <div className="inline-form mt-3">
                    <button
                      type="button"
                      className={active ? "btn btn-primary" : "btn btn-secondary"}
                      onClick={() => selectProject(project.id)}
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
            description="Choose a project above to manage co-writers, drafts, and script access."
          />
        ) : (
          <div className="stack">
            <RecommendedCompetitions projectId={selectedProject.id} />

            <section className="stack">
              <div className="subcard-header">
                <h3 className="text-2xl text-foreground">Co-Writers</h3>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCoWriterModalOpen(true)}
                  disabled={loading || contextLoading}
                >
                  Add co-writer
                </button>
              </div>

              {coWriters.length === 0 ? <p className="muted">No co-writers added yet.</p> : null}
              <article className="subcard stack">
                {coWriters.map((coWriter) => (
                  <article key={coWriter.coWriterUserId} className="rounded-xl border border-zinc-300/60 bg-surface p-3">
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
                  <h3 className="text-2xl text-foreground">Draft Lifecycle</h3>
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
                  <article key={draft.id} className="rounded-xl border border-zinc-300/60 bg-surface p-3">
                    <div className="subcard-header">
                      <strong>
                        {draft.versionLabel} ({draft.scriptId})
                      </strong>
                      <span className="badge">
                        {draft.lifecycleState}
                        {draft.isPrimary ? " | primary" : ""}
                      </span>
                    </div>
                    {draft.changeSummary ? <p className="mt-2 text-sm text-foreground-secondary">{draft.changeSummary}</p> : null}
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
                        className="btn btn-secondary"
                        onClick={() => void archiveDraft(draft.id)}
                        disabled={loading || contextLoading || draft.lifecycleState === "archived"}
                      >
                        Archive
                      </button>
                      <button
                        type="button"
                        className={selectedScriptId === draft.scriptId ? "btn btn-primary" : "btn btn-secondary"}
                        onClick={() => {
                          setSelectedScriptId(draft.scriptId);
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
              <h3 className="text-2xl text-foreground">Script Access Workflow + Audit Trail</h3>
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
                  onClick={() => void mutateAccessRequests()}
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
                <article key={entry.id} className="rounded-xl border border-zinc-300/60 bg-surface p-3">
                  <div className="subcard-header">
                    <strong>{entry.requesterUserId}</strong>
                    <span className="badge">{entry.status}</span>
                  </div>
                  <p className="muted mt-2">Requested: {new Date(entry.requestedAt).toLocaleString()}</p>
                  {entry.reason ? <p className="mt-2 text-sm text-foreground-secondary">{entry.reason}</p> : null}
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
            <textarea
              className="input textarea"
              rows={2}
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
              />
            </label>
          </div>
          <label className="stack-tight">
            <span>Page count</span>
            <input
              className="input"
              type="number"
              value={projectForm.pageCount}
              onChange={(event) =>
                setProjectForm((current) => ({
                  ...current,
                  pageCount: Number(event.target.value)
                }))
              }
            />
          </label>
          <label className="flex items-center gap-2">
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
            <span>Make discoverable</span>
          </label>
          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              Create project
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={coWriterModalOpen}
        onClose={() => setCoWriterModalOpen(false)}
        title="Add co-writer"
        description="Grant another writer co-authorship on this project."
      >
        <form className="stack" onSubmit={addCoWriter}>
          <label className="stack-tight">
            <span>Co-writer user ID</span>
            <input
              className="input"
              value={coWriterUserId}
              onChange={(event) => setCoWriterUserId(event.target.value)}
              placeholder="writer_02"
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
              <p className="text-sm font-semibold text-tide-700 dark:text-tide-500">{uploadStepLabels[uploadStep]}</p>
              <div className="h-2 overflow-hidden rounded-full bg-background-secondary">
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
                placeholder="script_xxx"
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
                placeholder="v1"
              />
            </label>
          </div>
          <label className="stack-tight">
            <span>Change summary</span>
            <textarea
              className="input textarea"
              rows={2}
              value={draftForm.changeSummary}
              onChange={(event) =>
                setDraftForm((current) => ({ ...current, changeSummary: event.target.value }))
              }
            />
          </label>
          <label className="stack-tight">
            <span>Page count</span>
            <input
              className="input"
              type="number"
              value={draftForm.pageCount}
              onChange={(event) =>
                setDraftForm((current) => ({
                  ...current,
                  pageCount: Number(event.target.value)
                }))
              }
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draftForm.setPrimary}
              onChange={(event) =>
                setDraftForm((current) => ({ ...current, setPrimary: event.target.checked }))
              }
            />
            <span>Set as primary draft</span>
          </label>
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
    </section>
  );
}
