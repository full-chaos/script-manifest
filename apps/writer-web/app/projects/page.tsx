"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Project, ProjectCreateRequest } from "@script-manifest/contracts";
import { readStoredSession } from "../lib/authSession";

type ProjectDraft = {
  title: string;
  logline: string;
  synopsis: string;
  format: string;
  genre: string;
  pageCount: number;
  isDiscoverable: boolean;
};

const initialDraft: ProjectDraft = {
  title: "",
  logline: "",
  synopsis: "",
  format: "feature",
  genre: "drama",
  pageCount: 100,
  isDiscoverable: false
};

export default function ProjectsPage() {
  const [ownerUserId, setOwnerUserId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [draft, setDraft] = useState<ProjectDraft>(initialDraft);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const session = readStoredSession();
    if (session) {
      setOwnerUserId(session.user.id);
    }
  }, []);

  const canLoad = useMemo(() => ownerUserId.trim().length > 0, [ownerUserId]);

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

      setProjects(body.projects as Project[]);
      setStatus(`Loaded ${body.projects.length as number} projects.`);
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
      title: draft.title,
      logline: draft.logline,
      synopsis: draft.synopsis,
      format: draft.format,
      genre: draft.genre,
      pageCount: Number.isFinite(draft.pageCount) ? draft.pageCount : 0,
      isDiscoverable: draft.isDiscoverable
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

      setDraft(initialDraft);
      setProjects((current) => [body.project as Project, ...current]);
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
      setProjects((current) => current.filter((project) => project.id !== projectId));
      setStatus("Project deleted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card stack">
      <h2>Projects</h2>
      <p className="muted">Create and manage projects backed by profile-project-service.</p>

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
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            required
          />
        </label>

        <label className="stack-tight">
          <span>Logline</span>
          <input
            className="input"
            value={draft.logline}
            onChange={(event) => setDraft((current) => ({ ...current, logline: event.target.value }))}
          />
        </label>

        <label className="stack-tight">
          <span>Synopsis</span>
          <textarea
            className="input textarea"
            rows={4}
            value={draft.synopsis}
            onChange={(event) => setDraft((current) => ({ ...current, synopsis: event.target.value }))}
          />
        </label>

        <div className="grid-two">
          <label className="stack-tight">
            <span>Format</span>
            <input
              className="input"
              value={draft.format}
              onChange={(event) => setDraft((current) => ({ ...current, format: event.target.value }))}
              required
            />
          </label>

          <label className="stack-tight">
            <span>Genre</span>
            <input
              className="input"
              value={draft.genre}
              onChange={(event) => setDraft((current) => ({ ...current, genre: event.target.value }))}
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
              value={draft.pageCount}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  pageCount: Number(event.target.value)
                }))
              }
            />
          </label>

          <label className="stack-tight checkbox">
            <input
              type="checkbox"
              checked={draft.isDiscoverable}
              onChange={(event) =>
                setDraft((current) => ({
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
            <p>
              Viewer scaffold: <Link href="/projects/script_demo_01/viewer">open demo script viewer</Link>
            </p>
          </article>
        ))}
      </section>

      {status ? <p className="status-note">{status}</p> : null}
    </section>
  );
}
