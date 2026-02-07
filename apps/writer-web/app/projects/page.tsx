"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  Project,
  ProjectCoWriter,
  ProjectCreateRequest,
  ProjectDraft
} from "@script-manifest/contracts";
import { readStoredSession } from "../lib/authSession";

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
  const [loading, setLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const session = readStoredSession();
    if (session) {
      setOwnerUserId(session.user.id);
    }
  }, []);

  const canLoad = useMemo(() => ownerUserId.trim().length > 0, [ownerUserId]);

  async function loadProjectContext(projectId: string) {
    if (!projectId) {
      setCoWriters([]);
      setDrafts([]);
      return;
    }

    setContextLoading(true);
    try {
      const [coWritersResponse, draftsResponse] = await Promise.all([
        fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/co-writers`, { cache: "no-store" }),
        fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/drafts`, { cache: "no-store" })
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

  async function loadProjects() {
    if (!canLoad) {
      setStatus("Set owner user ID or sign in first.");
      return;
    }

    setLoading(true);
    setStatus("");
    try {
      const response = await fetch(
        `/api/v1/projects?ownerUserId=${encodeURIComponent(ownerUserId)}`,
        { cache: "no-store" }
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
    if (!canLoad) {
      setStatus("Owner ID is required.");
      return;
    }

    setLoading(true);
    setStatus("");

    const payload: ProjectCreateRequest = {
      ownerUserId,
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus(body.error ? `Error: ${body.error}` : "Unable to create project.");
        return;
      }

      const created = body.project as Project;
      setProjectForm(initialProjectForm);
      setProjects((current) => [created, ...current]);
      setSelectedProjectId(created.id);
      await loadProjectContext(created.id);
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
        method: "DELETE"
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
          headers: { "content-type": "application/json" },
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
        { method: "DELETE" }
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ownerUserId,
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
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ownerUserId })
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
          headers: { "content-type": "application/json" },
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
    <section className="card stack">
      <h2>Projects</h2>
      <p className="muted">Create and manage projects, co-writers, and draft lifecycle in one place.</p>

      <div className="inline-form">
        <input
          className="input"
          value={ownerUserId}
          onChange={(event) => setOwnerUserId(event.target.value)}
          placeholder="owner user id"
        />
        <button type="button" className="btn btn-active" onClick={loadProjects} disabled={loading}>
          {loading ? "Loading..." : "Load projects"}
        </button>
      </div>

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

        <button type="submit" className="btn btn-active" disabled={loading}>
          {loading ? "Saving..." : "Create project"}
        </button>
      </form>

      <section className="stack">
        <h3>Your Projects</h3>
        {projects.length === 0 ? <p className="muted">No projects found.</p> : null}
        {projects.map((project) => (
          <article key={project.id} className="subcard">
            <div className="subcard-header">
              <strong>{project.title}</strong>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => deleteProject(project.id)}
                disabled={loading}
              >
                Delete
              </button>
            </div>
            <p className="muted">
              {project.format} | {project.genre} | {project.pageCount} pages
            </p>
            {project.logline ? <p>{project.logline}</p> : null}
            <div className="inline-form">
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  setSelectedProjectId(project.id);
                  await loadProjectContext(project.id);
                }}
              >
                Manage co-writers + drafts
              </button>
              <span className="muted">
                Viewer scaffold: <Link href="/projects/script_demo_01/viewer">open demo script viewer</Link>
              </span>
            </div>
          </article>
        ))}
      </section>

      <section className="stack">
        <h3>Selected Project Context</h3>
        {selectedProjectId ? (
          <p className="muted">Managing project: {selectedProjectId}</p>
        ) : (
          <p className="muted">Select a project to manage co-writers and drafts.</p>
        )}

        {selectedProjectId ? (
          <>
            <form className="stack" onSubmit={addCoWriter}>
              <h4>Co-Writers</h4>
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
              <button type="submit" className="btn" disabled={loading || contextLoading}>
                Add co-writer
              </button>
            </form>

            {coWriters.length === 0 ? <p className="muted">No co-writers added.</p> : null}
            {coWriters.map((coWriter) => (
              <article key={coWriter.coWriterUserId} className="subcard">
                <div className="subcard-header">
                  <strong>{coWriter.coWriterUserId}</strong>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => removeCoWriter(coWriter.coWriterUserId)}
                    disabled={loading || contextLoading}
                  >
                    Remove co-writer
                  </button>
                </div>
                <p className="muted">Credit order: {coWriter.creditOrder}</p>
              </article>
            ))}

            <form className="stack" onSubmit={createDraft}>
              <h4>Draft Lifecycle</h4>
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

              <button type="submit" className="btn" disabled={loading || contextLoading}>
                Create draft
              </button>
            </form>

            {drafts.length === 0 ? <p className="muted">No drafts added yet.</p> : null}
            {drafts.map((draft) => (
              <article key={draft.id} className="subcard">
                <div className="subcard-header">
                  <strong>
                    {draft.versionLabel} ({draft.scriptId})
                  </strong>
                  <span className="muted">
                    {draft.lifecycleState}
                    {draft.isPrimary ? " | primary" : ""}
                  </span>
                </div>
                {draft.changeSummary ? <p>{draft.changeSummary}</p> : null}
                <p className="muted">{draft.pageCount} pages</p>
                <div className="inline-form">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setPrimaryDraft(draft.id)}
                    disabled={loading || contextLoading || draft.lifecycleState === "archived" || draft.isPrimary}
                  >
                    Set primary
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => archiveDraft(draft.id)}
                    disabled={loading || contextLoading || draft.lifecycleState === "archived"}
                  >
                    Archive draft
                  </button>
                </div>
              </article>
            ))}
          </>
        ) : null}
      </section>

      {status ? <p className="status-note">{status}</p> : null}
    </section>
  );
}
