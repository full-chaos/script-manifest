"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type {
  Project,
  ProjectCoWriter,
  ProjectCreateRequest,
  ProjectDraft
} from "@script-manifest/contracts";
import { Modal } from "../components/modal";
import { getAuthHeaders, readStoredSession } from "../lib/authSession";

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

export default function ProjectsPage() {
  const [ownerUserId, setOwnerUserId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [coWriters, setCoWriters] = useState<ProjectCoWriter[]>([]);
  const [drafts, setDrafts] = useState<ProjectDraft[]>([]);

  const [projectForm, setProjectForm] = useState<ProjectForm>(initialProjectForm);
  const [coWriterUserId, setCoWriterUserId] = useState("");
  const [coWriterCreditOrder, setCoWriterCreditOrder] = useState(2);
  const [draftForm, setDraftForm] = useState<DraftForm>(initialDraftForm);

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [coWriterModalOpen, setCoWriterModalOpen] = useState(false);
  const [draftModalOpen, setDraftModalOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [status, setStatus] = useState("");

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  useEffect(() => {
    const session = readStoredSession();
    if (!session) {
      setStatus("Sign in to load your projects.");
      return;
    }

    setOwnerUserId(session.user.id);
    void loadProjects(session.user.id);
  }, []);

  async function loadProjectContext(projectId: string) {
    if (!projectId) {
      setCoWriters([]);
      setDrafts([]);
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
        setStatus("Failed to load co-writers or drafts.");
        return;
      }

      setCoWriters(coWritersBody.coWriters as ProjectCoWriter[]);
      setDrafts(draftsBody.drafts as ProjectDraft[]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setContextLoading(false);
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
    setStatus("");
    try {
      const response = await fetch(
        `/api/v1/projects?ownerUserId=${encodeURIComponent(targetOwnerId)}`,
        { cache: "no-store", headers: getAuthHeaders() }
      );
      const body = await response.json();
      if (!response.ok) {
        setStatus(body.error ? `Error: ${body.error}` : "Unable to load projects.");
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
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerUserId.trim()) {
      setStatus("Owner ID is required.");
      return;
    }

    setLoading(true);
    setStatus("");

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
        setStatus(body.error ? `Error: ${body.error}` : "Unable to create project.");
        return;
      }

      const created = body.project as Project;
      setProjectForm(initialProjectForm);
      setProjectModalOpen(false);
      setProjects((current) => [created, ...current]);
      await selectProject(created.id);
      setStatus("Project created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  async function deleteProject(projectId: string) {
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        const body = await response.json();
        setStatus(body.error ? `Error: ${body.error}` : "Delete failed.");
        return;
      }

      const remaining = projects.filter((project) => project.id !== projectId);
      setProjects(remaining);
      if (selectedProjectId === projectId) {
        const next = remaining[0]?.id ?? "";
        setSelectedProjectId(next);
        await loadProjectContext(next);
      }
      setStatus("Project deleted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  async function addCoWriter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId || !coWriterUserId.trim()) {
      setStatus("Select a project and provide a co-writer user ID.");
      return;
    }

    setLoading(true);
    setStatus("");
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
        setStatus(body.error ? `Error: ${body.error}` : "Unable to add co-writer.");
        return;
      }

      setCoWriterUserId("");
      setCoWriterCreditOrder(2);
      setCoWriterModalOpen(false);
      await loadProjectContext(selectedProjectId);
      setStatus("Co-writer added.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  async function removeCoWriter(coWriterId: string) {
    if (!selectedProjectId) {
      return;
    }

    setLoading(true);
    setStatus("");
    try {
      const response = await fetch(
        `/api/v1/projects/${encodeURIComponent(selectedProjectId)}/co-writers/${encodeURIComponent(coWriterId)}`,
        { method: "DELETE", headers: getAuthHeaders() }
      );
      if (!response.ok) {
        const body = await response.json();
        setStatus(body.error ? `Error: ${body.error}` : "Unable to remove co-writer.");
        return;
      }

      await loadProjectContext(selectedProjectId);
      setStatus("Co-writer removed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId || !ownerUserId) {
      setStatus("Select a project and sign in first.");
      return;
    }

    setLoading(true);
    setStatus("");
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
        setStatus(body.error ? `Error: ${body.error}` : "Unable to create draft.");
        return;
      }

      setDraftForm(initialDraftForm);
      setDraftModalOpen(false);
      await loadProjectContext(selectedProjectId);
      setStatus("Draft created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  async function setPrimaryDraft(draftId: string) {
    if (!selectedProjectId || !ownerUserId) {
      return;
    }

    setLoading(true);
    setStatus("");
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
        setStatus(body.error ? `Error: ${body.error}` : "Unable to set primary draft.");
        return;
      }

      await loadProjectContext(selectedProjectId);
      setStatus("Primary draft updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  async function archiveDraft(draftId: string) {
    if (!selectedProjectId) {
      return;
    }

    setLoading(true);
    setStatus("");
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
        setStatus(body.error ? `Error: ${body.error}` : "Unable to archive draft.");
        return;
      }

      await loadProjectContext(selectedProjectId);
      setStatus("Draft archived.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4">
      <article className="hero-card">
        <p className="eyebrow">Project Workspace</p>
        <h1 className="text-4xl text-ink-900">Co-writer + draft lifecycle</h1>
        <p className="max-w-3xl text-ink-700">
          Projects, co-writers, and draft versions are managed in one place with clean lifecycle
          transitions for active and archived versions.
        </p>
        <div className="inline-form">
          <span className="badge">Owner: {ownerUserId || "Not signed in"}</span>
          <button type="button" className="btn btn-secondary" onClick={() => void loadProjects()} disabled={loading || !ownerUserId}>
            {loading ? "Refreshing..." : "Refresh projects"}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setProjectModalOpen(true)} disabled={!ownerUserId}>
            Create project
          </button>
        </div>
      </article>

      {!ownerUserId ? (
        <article className="empty-state">Sign in first to manage projects and drafts.</article>
      ) : null}

      <article className="panel stack">
        <div className="subcard-header">
          <h2 className="section-title">Your Projects</h2>
          <span className="badge">{projects.length} total</span>
        </div>

        {projects.length === 0 ? <p className="empty-state">No projects found.</p> : null}

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
      </article>

      <article className="panel stack">
        <div className="subcard-header">
          <h2 className="section-title">Selected Project Context</h2>
          {selectedProject ? <span className="stat-chip">{selectedProject.title}</span> : null}
        </div>

        {!selectedProject ? (
          <p className="empty-state">Select a project to manage co-writers and drafts.</p>
        ) : (
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
                  </div>
                </article>
              ))}
            </article>
          </section>
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
            <button type="submit" className="btn btn-primary" disabled={loading || contextLoading}>
              Create draft
            </button>
          </div>
        </form>
      </Modal>

      {status ? <p className={status.startsWith("Error:") ? "status-error" : "status-note"}>{status}</p> : null}
    </section>
  );
}
