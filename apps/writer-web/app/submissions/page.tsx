"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Competition, Project, Submission, SubmissionStatus } from "@script-manifest/contracts";
import { readStoredSession } from "../lib/authSession";

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
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const session = readStoredSession();
    if (session) {
      setWriterId(session.user.id);
    }
  }, []);

  async function loadData() {
    if (!writerId.trim()) {
      setMessage("Set writer ID or sign in first.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const [projectResponse, competitionResponse, submissionResponse] = await Promise.all([
        fetch(`/api/v1/projects?ownerUserId=${encodeURIComponent(writerId)}`, { cache: "no-store" }),
        fetch("/api/v1/competitions", { cache: "no-store" }),
        fetch(`/api/v1/submissions?writerId=${encodeURIComponent(writerId)}`, { cache: "no-store" })
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
      if (!projectId && nextProjects[0]) {
        setProjectId(nextProjects[0].id);
      }
      if (!competitionId && nextCompetitions[0]) {
        setCompetitionId(nextCompetitions[0].id);
      }
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          writerId,
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

      setSubmissions((current) => [body.submission as Submission, ...current]);
      setMessage("Submission recorded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card stack">
      <h2>Submissions</h2>
      <p className="muted">Manual submission tracking for Phase 1 MVP.</p>

      <div className="inline-form">
        <input
          className="input"
          value={writerId}
          onChange={(event) => setWriterId(event.target.value)}
          placeholder="writer id"
        />
        <button type="button" className="btn btn-active" onClick={loadData} disabled={loading}>
          {loading ? "Loading..." : "Load"}
        </button>
      </div>

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

        <button type="submit" className="btn btn-active" disabled={loading}>
          {loading ? "Saving..." : "Create submission"}
        </button>
      </form>

      <section className="stack">
        <h3>Tracked Submissions</h3>
        {submissions.length === 0 ? <p className="muted">No submissions recorded.</p> : null}
        {submissions.map((submission) => (
          <article key={submission.id} className="subcard">
            <strong>{submission.id}</strong>
            <p className="muted">
              project {submission.projectId} | competition {submission.competitionId}
            </p>
            <p>Status: {submission.status}</p>
          </article>
        ))}
      </section>

      {message ? <p className="status-note">{message}</p> : null}
    </section>
  );
}
