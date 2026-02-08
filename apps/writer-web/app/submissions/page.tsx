"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Competition, Project, Submission, SubmissionStatus } from "@script-manifest/contracts";
import { Modal } from "../components/modal";
import { getAuthHeaders, readStoredSession } from "../lib/authSession";

const statuses: SubmissionStatus[] = [
  "pending",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "winner"
];

export default function SubmissionsPage() {
  const [writerId, setWriterId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [competitionId, setCompetitionId] = useState("");
  const [status, setStatus] = useState<SubmissionStatus>("pending");
  const [projects, setProjects] = useState<Project[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [reassignTargets, setReassignTargets] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  useEffect(() => {
    const session = readStoredSession();
    if (!session) {
      setMessage("Sign in to load submissions.");
      return;
    }

    setWriterId(session.user.id);
    void loadData(session.user.id);
  }, []);

  async function loadData(explicitWriterId?: string) {
    const targetWriterId = explicitWriterId ?? writerId;
    if (!targetWriterId.trim()) {
      setMessage("Sign in to load submissions.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const authHeaders = getAuthHeaders();
      const [projectResponse, competitionResponse, submissionResponse] = await Promise.all([
        fetch(`/api/v1/projects?ownerUserId=${encodeURIComponent(targetWriterId)}`, { cache: "no-store", headers: authHeaders }),
        fetch("/api/v1/competitions", { cache: "no-store" }),
        fetch(`/api/v1/submissions?writerId=${encodeURIComponent(targetWriterId)}`, { cache: "no-store", headers: authHeaders })
      ]);
      const [projectBody, competitionBody, submissionBody] = await Promise.all([
        projectResponse.json(),
        competitionResponse.json(),
        submissionResponse.json()
      ]);

      if (!projectResponse.ok || !competitionResponse.ok || !submissionResponse.ok) {
        setMessage("Failed to load one or more submission dependencies.");
        return;
      }

      const nextProjects = projectBody.projects as Project[];
      const nextCompetitions = competitionBody.competitions as Competition[];
      const nextSubmissions = submissionBody.submissions as Submission[];
      setProjects(nextProjects);
      setCompetitions(nextCompetitions);
      setSubmissions(nextSubmissions);
      setReassignTargets(
        Object.fromEntries(nextSubmissions.map((entry) => [entry.id, entry.projectId]))
      );
      setProjectId((current) => current || nextProjects[0]?.id || "");
      setCompetitionId((current) => current || nextCompetitions[0]?.id || "");
      setMessage("Submission data loaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  async function createSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!writerId || !projectId || !competitionId) {
      setMessage("Writer, project, and competition are required.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/submissions", {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          projectId,
          competitionId,
          status
        })
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error ? `Error: ${body.error}` : "Submission creation failed.");
        return;
      }

      const created = body.submission as Submission;
      setSubmissions((current) => [created, ...current]);
      setReassignTargets((current) => ({
        ...current,
        [created.id]: created.projectId
      }));
      setCreateModalOpen(false);
      setMessage("Submission recorded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  async function moveSubmission(submissionId: string) {
    const targetProjectId = reassignTargets[submissionId];
    if (!targetProjectId) {
      setMessage("Select a target project before moving.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/submissions/${encodeURIComponent(submissionId)}/project`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ projectId: targetProjectId })
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error ? `Error: ${body.error}` : "Submission move failed.");
        return;
      }

      const updated = body.submission as Submission;
      setSubmissions((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry))
      );
      setMessage("Submission moved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4">
      <article className="hero-card">
        <p className="eyebrow">Submission Hub</p>
        <h1 className="text-4xl text-ink-900">Track every competition outcome</h1>
        <p className="max-w-3xl text-ink-700">
          Keep all manual submission records and reassignments in one dashboard, with your signed-in
          profile loaded automatically.
        </p>
        <div className="inline-form">
          <span className="badge">Writer: {writerId || "Not signed in"}</span>
          <button type="button" className="btn btn-secondary" onClick={() => void loadData()} disabled={loading || !writerId}>
            {loading ? "Refreshing..." : "Refresh submissions"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCreateModalOpen(true)}
            disabled={!writerId || projects.length === 0 || competitions.length === 0}
          >
            Create submission
          </button>
        </div>
      </article>

      {!writerId ? (
        <article className="empty-state">Sign in first to load and track submissions.</article>
      ) : null}

      <article className="panel stack">
        <div className="subcard-header">
          <h2 className="section-title">Tracked Submissions</h2>
          <span className="badge">{submissions.length} total</span>
        </div>
        {submissions.length === 0 ? <p className="empty-state">No submissions recorded.</p> : null}
        {submissions.map((submission) => (
          <article key={submission.id} className="subcard">
            <div className="subcard-header">
              <strong>{submission.id}</strong>
              <span className="badge">{submission.status}</span>
            </div>
            <p className="muted mt-2">
              project {submission.projectId} | competition {submission.competitionId}
            </p>
            <div className="inline-form mt-3">
              <select
                className="input md:w-72"
                aria-label={`Move target for ${submission.id}`}
                value={reassignTargets[submission.id] ?? submission.projectId}
                onChange={(event) =>
                  setReassignTargets((current) => ({
                    ...current,
                    [submission.id]: event.target.value
                  }))
                }
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void moveSubmission(submission.id)}
                disabled={loading}
              >
                Move submission
              </button>
            </div>
          </article>
        ))}
      </article>

      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create submission"
        description="Record a manual competition submission from your current project list."
      >
        <form className="stack" onSubmit={createSubmission}>
          <label className="stack-tight">
            <span>Project</span>
            <select
              className="input"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              required
            >
              <option value="">Select project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </label>

          <label className="stack-tight">
            <span>Competition</span>
            <select
              className="input"
              value={competitionId}
              onChange={(event) => setCompetitionId(event.target.value)}
              required
            >
              <option value="">Select competition</option>
              {competitions.map((competition) => (
                <option key={competition.id} value={competition.id}>
                  {competition.title}
                </option>
              ))}
            </select>
          </label>

          <label className="stack-tight">
            <span>Status</span>
            <select
              className="input"
              value={status}
              onChange={(event) => setStatus(event.target.value as SubmissionStatus)}
            >
              {statuses.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>

          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Saving..." : "Create submission"}
            </button>
          </div>
        </form>
      </Modal>

      {message ? <p className={message.startsWith("Error:") ? "status-error" : "status-note"}>{message}</p> : null}
    </section>
  );
}
