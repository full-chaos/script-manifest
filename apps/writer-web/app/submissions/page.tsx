"use client";

import { useState, type FormEvent } from "react";
import type { Route } from "next";
import type {
  Competition,
  PlacementListItem,
  PlacementVerificationState,
  Project,
  Submission,
  SubmissionStatus
} from "@script-manifest/contracts";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { EmptyState } from "../components/emptyState";
import { EmptyIllustration } from "../components/illustrations";
import { Modal } from "../components/modal";
import { SkeletonCard } from "../components/skeleton";
import { useToast } from "../components/toast";
import { useAuth } from "../lib/AuthProvider";
import { fetcher, ApiError } from "../lib/fetcher";

const statuses: SubmissionStatus[] = [
  "pending",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "winner"
];

export default function SubmissionsPage() {
  const toast = useToast();
  const { user, loading: authLoading } = useAuth();
  const [projectId, setProjectId] = useState("");
  const [competitionId, setCompetitionId] = useState("");
  const [status, setStatus] = useState<SubmissionStatus>("pending");
  const [reassignTargets, setReassignTargets] = useState<Record<string, string>>({});
  const [mutating, setMutating] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [placementModalOpen, setPlacementModalOpen] = useState(false);
  const [targetSubmissionId, setTargetSubmissionId] = useState("");
  const [placementStatus, setPlacementStatus] = useState<SubmissionStatus>("quarterfinalist");

  // Auth-paused key: null while auth is resolving or no user — SWR will not fetch.
  const writerId = user?.id ?? "";
  const authPausedBase = authLoading || !writerId ? null : writerId;

  const projectsKey = authPausedBase
    ? `/api/v1/projects?ownerUserId=${encodeURIComponent(writerId)}`
    : null;
  const competitionsKey = "/api/v1/competitions";
  const submissionsKey = authPausedBase
    ? `/api/v1/submissions?writerId=${encodeURIComponent(writerId)}`
    : null;
  const placementsKey = authPausedBase
    ? `/api/v1/placements?writerId=${encodeURIComponent(writerId)}`
    : null;

  const { data: projectsData, isLoading: projectsLoading } = useSWR<{ projects: Project[] }>(
    projectsKey,
    {
      onSuccess(data) {
        setProjectId((cur) => cur || data.projects[0]?.id || "");
      },
      onError(err: unknown) {
        toast.error(err instanceof ApiError ? err.message : "Failed to load projects.");
      },
    }
  );

  const { data: competitionsData, isLoading: competitionsLoading } = useSWR<{
    competitions: Competition[];
  }>(competitionsKey, {
    onSuccess(data) {
      setCompetitionId((cur) => cur || data.competitions[0]?.id || "");
    },
    onError(err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load competitions.");
    },
  });

  const {
    data: submissionsData,
    isLoading: submissionsLoading,
    mutate: mutateSubmissions,
  } = useSWR<{ submissions: Submission[] }>(submissionsKey, {
    onSuccess(data) {
      setReassignTargets(
        Object.fromEntries(data.submissions.map((entry) => [entry.id, entry.projectId]))
      );
    },
    onError(err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load submissions.");
    },
  });

  const {
    data: placementsData,
    isLoading: placementsLoading,
    mutate: mutatePlacements,
  } = useSWR<{ placements: PlacementListItem[] }>(placementsKey, {
    onError(err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load placements.");
    },
  });

  const projects = projectsData?.projects ?? [];
  const competitions = competitionsData?.competitions ?? [];
  const submissions = submissionsData?.submissions ?? [];
  const placements = placementsData?.placements ?? [];
  const isInitialLoading =
    (projectsLoading || submissionsLoading || placementsLoading || competitionsLoading) &&
    !!writerId;

  const { trigger: triggerCreate, isMutating: creating } = useSWRMutation(
    submissionsKey,
    async (
      _key: string | null,
      { arg }: { arg: { projectId: string; competitionId: string; status: SubmissionStatus } }
    ) =>
      fetcher<{ submission: Submission }>("/api/v1/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(arg),
      }),
    {
      populateCache: false,
      throwOnError: false,
      onSuccess(data) {
        const created = data.submission;
        void mutateSubmissions(
          (cur) => ({ submissions: [created, ...(cur?.submissions ?? [])] }),
          { revalidate: false }
        );
        setReassignTargets((cur) => ({ ...cur, [created.id]: created.projectId }));
        setCreateModalOpen(false);
        toast.success("Submission recorded.");
        void fetch("/api/v1/onboarding-progress", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ submissionRecorded: true }),
        }).catch(() => {});
      },
      onError(err: unknown) {
        toast.error(err instanceof ApiError ? err.message : "Failed to create submission.");
      },
    }
  );

  async function createSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!writerId || !projectId || !competitionId) {
      toast.error("Writer, project, and competition are required.");
      return;
    }
    await triggerCreate({ projectId, competitionId, status });
  }

  async function moveSubmission(submissionId: string) {
    const targetProjectId = reassignTargets[submissionId];
    if (!targetProjectId) {
      toast.error("Select a target project before moving.");
      return;
    }

    setMutating(true);
    try {
      const data = await fetcher<{ submission: Submission }>(
        `/api/v1/submissions/${encodeURIComponent(submissionId)}/project`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId: targetProjectId }),
        }
      );
      void mutateSubmissions(
        (cur) => ({
          submissions: (cur?.submissions ?? []).map((entry) =>
            entry.id === data.submission.id ? data.submission : entry
          ),
        }),
        { revalidate: false }
      );
      toast.success("Submission moved.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to move submission.");
    } finally {
      setMutating(false);
    }
  }

  async function createPlacement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!targetSubmissionId) {
      toast.error("Choose a submission first.");
      return;
    }

    setMutating(true);
    try {
      const data = await fetcher<{ submission?: Submission }>(
        `/api/v1/submissions/${encodeURIComponent(targetSubmissionId)}/placements`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: placementStatus }),
        }
      );
      if (data.submission) {
        void mutateSubmissions(
          (cur) => ({
            submissions: (cur?.submissions ?? []).map((entry) =>
              entry.id === data.submission!.id ? data.submission! : entry
            ),
          }),
          { revalidate: false }
        );
      }
      void mutatePlacements();
      setPlacementModalOpen(false);
      setTargetSubmissionId("");
      toast.success("Placement recorded.");
      void fetch("/api/v1/onboarding-progress", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ placementRecorded: true }),
      }).catch(() => {});
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to create placement.");
    } finally {
      setMutating(false);
    }
  }

  async function verifyPlacement(
    placementId: string,
    verificationState: PlacementVerificationState
  ) {
    setMutating(true);
    try {
      await fetcher(`/api/v1/placements/${encodeURIComponent(placementId)}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verificationState }),
      });
      void mutatePlacements();
      toast.success(`Placement marked ${verificationState}.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to verify placement.");
    } finally {
      setMutating(false);
    }
  }

  const loading = creating || mutating;

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow eyebrow--violet">Submission Hub</p>
        <h1 className="text-4xl text-foreground">Track every competition outcome</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Track every submission, record placements, and move entries between projects — all from
          one dashboard.
        </p>
        <div className="inline-form">
          <span className="badge">{writerId ? `ID: ${writerId}` : "Not signed in"}</span>
          <button type="button" className="btn btn-secondary" onClick={() => void mutateSubmissions()} disabled={loading || !writerId}>
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
          illustration={<EmptyIllustration variant="inbox" className="h-14 w-14 text-foreground" />}
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

        {isInitialLoading ? (
          <div className="stack">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : submissions.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="inbox" className="h-14 w-14 text-foreground" />}
            title="No submissions yet"
            description="Hit 'Create submission' above to record your first competition entry."
          />
        ) : null}

        {!isInitialLoading ? (
          <div className="stack">
            {submissions.map((submission) => (
              <article key={submission.id} className="subcard">
                <div className="subcard-header">
                  <strong>{submission.id}</strong>
                  <span className="badge">{submission.status}</span>
                </div>
                <div className="mt-2 inline-form">
                  <span className="text-sm text-muted">
                    Project: {projects.find((p) => p.id === submission.projectId)?.title ?? submission.projectId}
                  </span>
                  <span className="text-sm text-muted">
                    Competition: {competitions.find((c) => c.id === submission.competitionId)?.title ?? submission.competitionId}
                  </span>
                </div>
                <div className="mt-3 inline-form">
                  <select
                    className="input"
                    value={reassignTargets[submission.id] ?? ""}
                    onChange={(event) =>
                      setReassignTargets((current) => ({
                        ...current,
                        [submission.id]: event.target.value,
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
                      <article key={placement.id} className="rounded-xl border border-zinc-300/60 bg-surface p-3">
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
            ))}
          </div>
        ) : null}
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
    </section>
  );
}
