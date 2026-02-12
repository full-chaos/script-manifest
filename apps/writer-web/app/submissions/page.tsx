"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Route } from "next";
import type {
  Competition,
  PlacementListItem,
  PlacementVerificationState,
  Project,
  Submission,
  SubmissionStatus
} from "@script-manifest/contracts";
import { EmptyState } from "../components/emptyState";
import { EmptyIllustration } from "../components/illustrations";
import { Modal } from "../components/modal";
import { SkeletonCard } from "../components/skeleton";
import { useToast } from "../components/toast";
import { getAuthHeaders, readStoredSession } from "../lib/authSession";

const statuses: SubmissionStatus[] = [
  "pending",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "winner"
];

export default function SubmissionsPage() {
  const toast = useToast();
  const [writerId, setWriterId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [competitionId, setCompetitionId] = useState("");
  const [status, setStatus] = useState<SubmissionStatus>("pending");
  const [projects, setProjects] = useState<Project[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [placements, setPlacements] = useState<PlacementListItem[]>([]);
  const [reassignTargets, setReassignTargets] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [placementModalOpen, setPlacementModalOpen] = useState(false);
  const [targetSubmissionId, setTargetSubmissionId] = useState("");
  const [placementStatus, setPlacementStatus] = useState<SubmissionStatus>("quarterfinalist");

  useEffect(() => {
    const session = readStoredSession();
    if (!session) {
      setMessage("Sign in to load submissions.");
      setInitialLoading(false);
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
      const placementsResponse = await fetch(
        `/api/v1/placements?writerId=${encodeURIComponent(targetWriterId)}`,
        { cache: "no-store", headers: authHeaders }
      );
      const [projectBody, competitionBody, submissionBody] = await Promise.all([
        projectResponse.json(),
        competitionResponse.json(),
        submissionResponse.json()
      ]);
      const placementsBody = await placementsResponse.json();

      if (!projectResponse.ok || !competitionResponse.ok || !submissionResponse.ok || !placementsResponse.ok) {
        toast.error("Failed to load one or more submission dependencies.");
        return;
      }

      const nextProjects = projectBody.projects as Project[];
      const nextCompetitions = competitionBody.competitions as Competition[];
      const nextSubmissions = submissionBody.submissions as Submission[];
      setProjects(nextProjects);
      setCompetitions(nextCompetitions);
      setSubmissions(nextSubmissions);
      setPlacements((placementsBody.placements as PlacementListItem[]) ?? []);
      setReassignTargets(
        Object.fromEntries(nextSubmissions.map((entry) => [entry.id, entry.projectId]))
      );
      setProjectId((current) => current || nextProjects[0]?.id || "");
      setCompetitionId((current) => current || nextCompetitions[0]?.id || "");
      setMessage("Submission data loaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load submissions.");
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }

  async function createSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!writerId || !projectId || !competitionId) {
      toast.error("Writer, project, and competition are required.");
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
        toast.error(body.error ? `${body.error as string}` : "Submission creation failed.");
        return;
      }

      const created = body.submission as Submission;
      setSubmissions((current) => [created, ...current]);
      setReassignTargets((current) => ({
        ...current,
        [created.id]: created.projectId
      }));
      setCreateModalOpen(false);
      toast.success("Submission recorded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create submission.");
    } finally {
      setLoading(false);
    }
  }

  async function moveSubmission(submissionId: string) {
    const targetProjectId = reassignTargets[submissionId];
    if (!targetProjectId) {
      toast.error("Select a target project before moving.");
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
        toast.error(body.error ? `${body.error as string}` : "Submission move failed.");
        return;
      }

      const updated = body.submission as Submission;
      setSubmissions((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry))
      );
      toast.success("Submission moved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to move submission.");
    } finally {
      setLoading(false);
    }
  }

  async function createPlacement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!targetSubmissionId) {
      toast.error("Choose a submission first.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/v1/submissions/${encodeURIComponent(targetSubmissionId)}/placements`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ status: placementStatus })
        }
      );
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error ? `${body.error as string}` : "Placement creation failed.");
        return;
      }

      const updatedSubmission = body.submission as Submission | undefined;
      if (updatedSubmission) {
        setSubmissions((current) =>
          current.map((entry) => (entry.id === updatedSubmission.id ? updatedSubmission : entry))
        );
      }
      await loadData();

      setPlacementModalOpen(false);
      setTargetSubmissionId("");
      toast.success("Placement recorded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create placement.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyPlacement(placementId: string, verificationState: PlacementVerificationState) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/placements/${encodeURIComponent(placementId)}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ verificationState })
      });
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error ? `${body.error as string}` : "Placement verification update failed.");
        return;
      }
      await loadData();
      toast.success(`Placement marked ${verificationState}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to verify placement.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow eyebrow--violet">Submission Hub</p>
        <h1 className="text-4xl text-ink-900">Track every competition outcome</h1>
        <p className="max-w-3xl text-ink-700">
          Track every submission, record placements, and move entries between projects — all from
          one dashboard.
        </p>
        <div className="inline-form">
          <span className="badge">{writerId ? `ID: ${writerId}` : "Not signed in"}</span>
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
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPlacementModalOpen(true)}
            disabled={!writerId || submissions.length === 0}
          >
            Record placement
          </button>
        </div>
      </article>

      {!writerId ? (
        <EmptyState
          illustration={<EmptyIllustration variant="inbox" className="h-14 w-14 text-ink-900" />}
          title="Sign in to track submissions"
          description="Create an account or sign in to record competition submissions and placements."
          actionLabel="Sign in"
          actionHref={"/signin" as Route}
        />
      ) : null}

      <article className="panel stack">
        <div className="subcard-header">
          <h2 className="section-title">Tracked Submissions</h2>
          <span className="badge">{submissions.length} total</span>
        </div>

        {initialLoading && writerId ? (
          <div className="stack">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : submissions.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="inbox" className="h-14 w-14 text-ink-900" />}
            title="No submissions yet"
            description="Hit 'Create submission' above to record your first competition entry."
          />
        ) : null}

        {!initialLoading
          ? submissions.map((submission) => (
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
                <div className="stack mt-3">
                  <p className="eyebrow">Placements</p>
                  {placements.filter((placement) => placement.submissionId === submission.id).length === 0 ? (
                    <p className="muted">No placements recorded.</p>
                  ) : null}
                  {placements
                    .filter((placement) => placement.submissionId === submission.id)
                    .map((placement) => (
                      <article key={placement.id} className="rounded-xl border border-zinc-300/60 bg-white p-3">
                        <div className="subcard-header">
                          <strong>{placement.id}</strong>
                          <span className="badge">
                            {placement.status} | {placement.verificationState}
                          </span>
                        </div>
                        <div className="inline-form mt-2">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => void verifyPlacement(placement.id, "verified")}
                            disabled={loading || placement.verificationState === "verified"}
                          >
                            Mark verified
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => void verifyPlacement(placement.id, "rejected")}
                            disabled={loading || placement.verificationState === "rejected"}
                          >
                            Mark rejected
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
              </article>
            ))
          : null}
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

      <Modal
        open={placementModalOpen}
        onClose={() => setPlacementModalOpen(false)}
        title="Record placement"
        description="Attach a placement outcome to an existing submission."
      >
        <form className="stack" onSubmit={createPlacement}>
          <label className="stack-tight">
            <span>Submission</span>
            <select
              className="input"
              value={targetSubmissionId}
              onChange={(event) => setTargetSubmissionId(event.target.value)}
              required
            >
              <option value="">Select submission</option>
              {submissions.map((submission) => (
                <option key={submission.id} value={submission.id}>
                  {submission.id} ({submission.status})
                </option>
              ))}
            </select>
          </label>

          <label className="stack-tight">
            <span>Placement status</span>
            <select
              className="input"
              value={placementStatus}
              onChange={(event) => setPlacementStatus(event.target.value as SubmissionStatus)}
            >
              {statuses
                .filter((value) => value !== "pending")
                .map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
            </select>
          </label>

          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Saving..." : "Create placement"}
            </button>
          </div>
        </form>
      </Modal>

      {message ? <p className={message.startsWith("Error:") ? "status-error" : "status-note"}>{message}</p> : null}
    </section>
  );
}
