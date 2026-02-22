"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  FeedbackListing,
  FeedbackReview,
  Project,
  ProjectDraft,
  ScriptRegisterResponse,
  TokenBalanceResponse
} from "@script-manifest/contracts";
import { Modal } from "../components/modal";
import { EmptyState } from "../components/emptyState";
import { EmptyIllustration } from "../components/illustrations";
import { SkeletonCard } from "../components/skeleton";
import { useToast } from "../components/toast";
import { getAuthHeaders, readStoredSession } from "../lib/authSession";
import { type ScriptUploadProxyResponse, uploadScriptViaProxy } from "../lib/scriptUpload";

function createScriptId(): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return `script_${randomId}`;
  return `script_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getScriptContentType(file: File): string {
  return file.type || "application/octet-stream";
}

type UploadStep = "idle" | "creating_session" | "uploading" | "registering" | "creating_project" | "done";

const uploadStepLabels: Record<UploadStep, string> = {
  idle: "",
  creating_session: "Preparing upload...",
  uploading: "Uploading file...",
  registering: "Registering script...",
  creating_project: "Creating project & listing...",
  done: "Done!"
};

type Tab = "available" | "my-listings" | "my-reviews";

type DeadlineInfo = {
  label: string;
  urgency: "expired" | "urgent" | "approaching" | "comfortable";
};

function describeDeadline(deadline: string): DeadlineInfo {
  const deltaMs = new Date(deadline).getTime() - Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  if (deltaMs < 0) {
    return { label: "Expired", urgency: "expired" };
  }

  const daysRemaining = Math.ceil(deltaMs / dayMs);
  if (daysRemaining <= 3) {
    return { label: `${daysRemaining as number}d left`, urgency: "urgent" };
  }
  if (daysRemaining <= 14) {
    return { label: `${daysRemaining as number}d left`, urgency: "approaching" };
  }
  return { label: `${daysRemaining as number}d left`, urgency: "comfortable" };
}

const urgencyColors: Record<DeadlineInfo["urgency"], string> = {
  expired: "border-ink-500/20 bg-ink-500/10 text-ink-500",
  urgent: "border-red-300 bg-red-50 text-red-700",
  approaching: "border-amber-300 bg-amber-50 text-amber-700",
  comfortable: "border-tide-500/30 bg-tide-500/10 text-tide-700"
};

const statusColors: Record<string, string> = {
  open: "border-tide-500/30 bg-tide-500/10 text-tide-700",
  claimed: "border-amber-300 bg-amber-50 text-amber-700",
  completed: "border-green-300 bg-green-50 text-green-700",
  expired: "border-ink-500/20 bg-ink-500/10 text-ink-500",
  cancelled: "border-ink-500/20 bg-ink-500/10 text-ink-500"
};

export default function FeedbackPage() {
  const toast = useToast();
  const [signedInUserId, setSignedInUserId] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [listings, setListings] = useState<FeedbackListing[]>([]);
  const [myListings, setMyListings] = useState<FeedbackListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("available");

  // Project/draft picker
  const [projects, setProjects] = useState<Project[]>([]);
  const [drafts, setDrafts] = useState<ProjectDraft[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");

  // My reviews
  const [myReviews, setMyReviews] = useState<FeedbackReview[]>([]);

  // Inline upload
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");

  // Create listing form
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    projectId: "",
    scriptId: "",
    title: "",
    description: "",
    genre: "",
    format: "",
    pageCount: ""
  });
  const [creating, setCreating] = useState(false);

  // Review submission modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<FeedbackReview | null>(null);
  const [rubricForm, setRubricForm] = useState({
    storyStructureScore: "",
    storyStructureComment: "",
    charactersScore: "",
    charactersComment: "",
    dialogueScore: "",
    dialogueComment: "",
    craftVoiceScore: "",
    craftVoiceComment: "",
    overallComment: ""
  });
  const [submittingReview, setSubmittingReview] = useState(false);

  // Rating modal
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [ratingReviewId, setRatingReviewId] = useState("");
  const [ratingScore, setRatingScore] = useState("");
  const [ratingComment, setRatingComment] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);

  useEffect(() => {
    const session = readStoredSession();
    if (session) {
      setSignedInUserId(session.user.id);
    }
  }, []);

  const loadBalance = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/feedback/tokens/balance", {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const body = (await response.json()) as TokenBalanceResponse;
        setBalance(body.balance);
      }
    } catch {
      // Silently fail — balance will show as null
    }
  }, []);

  const grantSignupTokens = useCallback(async () => {
    try {
      await fetch("/api/v1/feedback/tokens/grant-signup", {
        method: "POST",
        headers: getAuthHeaders()
      });
      await loadBalance();
    } catch {
      // Grant is idempotent, failure is non-critical
    }
  }, [loadBalance]);

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/feedback/listings?status=open", { cache: "no-store" });
      const body = (await response.json()) as { listings?: FeedbackListing[] };
      setListings(body.listings ?? []);

      if (signedInUserId) {
        const myResponse = await fetch(
          `/api/v1/feedback/listings?ownerUserId=${encodeURIComponent(signedInUserId)}`,
          { cache: "no-store" }
        );
        const myBody = (await myResponse.json()) as { listings?: FeedbackListing[] };
        setMyListings(myBody.listings ?? []);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load listings.");
    } finally {
      setLoading(false);
    }
  }, [signedInUserId, toast]);

  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/v1/projects?ownerUserId=${encodeURIComponent(signedInUserId)}`,
        { headers: getAuthHeaders() }
      );
      if (response.ok) {
        const body = (await response.json()) as { projects?: Project[] };
        setProjects(body.projects ?? []);
      }
    } catch {
      // Non-critical — user can still type IDs manually
    }
  }, [signedInUserId]);

  async function loadDrafts(projectId: string) {
    setDrafts([]);
    if (!projectId) return;
    try {
      const response = await fetch(
        `/api/v1/projects/${encodeURIComponent(projectId)}/drafts`,
        { headers: getAuthHeaders() }
      );
      if (response.ok) {
        const body = (await response.json()) as { drafts?: ProjectDraft[] };
        setDrafts(body.drafts ?? []);
      }
    } catch {
      // Non-critical
    }
  }

  const loadMyReviews = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/v1/feedback/reviews?reviewerUserId=${encodeURIComponent(signedInUserId)}`,
        { headers: getAuthHeaders() }
      );
      if (response.ok) {
        const body = (await response.json()) as { reviews?: FeedbackReview[] };
        setMyReviews(body.reviews ?? []);
      }
    } catch {
      // Non-critical
    }
  }, [signedInUserId]);

  useEffect(() => {
    if (signedInUserId) {
      void loadBalance();
      void grantSignupTokens();
      void loadProjects();
      void loadMyReviews();
    }
    void loadListings();
  }, [grantSignupTokens, loadBalance, loadListings, loadMyReviews, loadProjects, signedInUserId]);

  function handleProjectSelect(projectId: string) {
    setSelectedProjectId(projectId);
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      setCreateForm((f) => ({
        ...f,
        projectId,
        genre: project.genre,
        format: project.format,
        title: project.title
      }));
      void loadDrafts(projectId);
    } else {
      setCreateForm((f) => ({ ...f, projectId, scriptId: "", pageCount: "" }));
      setDrafts([]);
    }
  }

  function handleDraftSelect(draftId: string) {
    const draft = drafts.find((d) => d.id === draftId);
    if (draft) {
      setCreateForm((f) => ({
        ...f,
        scriptId: draft.scriptId,
        pageCount: String(draft.pageCount || "")
      }));
    }
  }

  async function uploadScriptAndCreateProject(): Promise<{ projectId: string; scriptId: string } | null> {
    if (!uploadFile) return null;

    const scriptId = createScriptId();
    const contentType = getScriptContentType(uploadFile);

    // Step 1: Upload via server-side proxy
    setUploadStep("creating_session");
    setUploadStep("uploading");
    const uploadRes = await uploadScriptViaProxy({
      scriptId,
      ownerUserId: signedInUserId,
      file: uploadFile,
      contentType,
      headers: getAuthHeaders()
    });
    if (!uploadRes.ok) {
      const detailPayload = (await uploadRes.json().catch(async () => ({
        detail: await uploadRes.text()
      }))) as { detail?: string; error?: string };
      const detailMessage = detailPayload.detail ?? detailPayload.error ?? "File upload failed.";
      toast.error(detailMessage);
      return null;
    }
    const uploadBody = (await uploadRes.json()) as ScriptUploadProxyResponse;

    // Step 2: Register script metadata
    setUploadStep("registering");
    const registerRes = await fetch("/api/v1/scripts/register", {
      method: "POST",
      headers: { "content-type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        scriptId,
        ownerUserId: signedInUserId,
        objectKey: uploadBody.objectKey,
        filename: uploadFile.name,
        contentType,
        size: uploadFile.size
      })
    });
    const registerBody = (await registerRes.json()) as ScriptRegisterResponse | { error?: string };
    if (!registerRes.ok) {
      toast.error("error" in registerBody && registerBody.error ? registerBody.error : "Failed to register script.");
      return null;
    }
    const registeredScriptId = (registerBody as ScriptRegisterResponse).script.scriptId;

    // Step 3: Create project
    setUploadStep("creating_project");
    const projRes = await fetch("/api/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        title: createForm.title || uploadFile.name.replace(/\.[^.]+$/, ""),
        genre: createForm.genre || "unspecified",
        format: createForm.format || "feature",
        pageCount: Number(createForm.pageCount) || 0
      })
    });
    const projBody = (await projRes.json()) as { project?: Project; error?: string };
    if (!projRes.ok) {
      toast.error(projBody.error ?? "Failed to create project.");
      return null;
    }
    const projectId = projBody.project!.id;

    // Step 4: Create draft linking script to project
    await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        scriptId: registeredScriptId,
        versionLabel: "v1",
        pageCount: Number(createForm.pageCount) || 0,
        setPrimary: true
      })
    });

    setUploadStep("done");
    return { projectId, scriptId: registeredScriptId };
  }

  async function handleCreateListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    try {
      let projectId = createForm.projectId;
      let scriptId = createForm.scriptId;

      // If inline upload is active, do the full upload → project → draft flow
      if (uploadFile && !projectId) {
        const result = await uploadScriptAndCreateProject();
        if (!result) {
          return; // Error already shown by upload function
        }
        projectId = result.projectId;
        scriptId = result.scriptId;
      }

      if (!projectId || !scriptId) {
        toast.error("Select a project and draft, or upload a manuscript file.");
        return;
      }

      const response = await fetch("/api/v1/feedback/listings", {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          projectId,
          scriptId,
          title: createForm.title,
          description: createForm.description,
          genre: createForm.genre,
          format: createForm.format,
          pageCount: Number(createForm.pageCount) || 0
        })
      });
      const body = (await response.json()) as { listing?: FeedbackListing; error?: string };
      if (!response.ok) {
        toast.error(body.error === "insufficient_tokens" ? "Not enough tokens. Review others' scripts to earn more." : body.error ?? "Failed to create listing.");
        return;
      }
      toast.success("Listing created! Your script is now available for feedback.");
      setCreateOpen(false);
      setCreateForm({ projectId: "", scriptId: "", title: "", description: "", genre: "", format: "", pageCount: "" });
      setUploadFile(null);
      setUploadStep("idle");
      await Promise.all([loadListings(), loadBalance(), loadProjects()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create listing.");
    } finally {
      setCreating(false);
      setUploadStep("idle");
    }
  }

  async function handleClaim(listingId: string) {
    try {
      const response = await fetch(`/api/v1/feedback/listings/${encodeURIComponent(listingId)}/claim`, {
        method: "POST",
        headers: getAuthHeaders()
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to claim listing.");
        return;
      }
      toast.success("Claimed! You have 7 days to submit your review.");
      await loadListings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to claim listing.");
    }
  }

  async function handleCancel(listingId: string) {
    try {
      const response = await fetch(`/api/v1/feedback/listings/${encodeURIComponent(listingId)}/cancel`, {
        method: "POST",
        headers: getAuthHeaders()
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to cancel listing.");
        return;
      }
      toast.success("Listing cancelled. Your token has been refunded.");
      await Promise.all([loadListings(), loadBalance()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel listing.");
    }
  }

  function openReviewModal(review: FeedbackReview) {
    setReviewTarget(review);
    setRubricForm({
      storyStructureScore: "",
      storyStructureComment: "",
      charactersScore: "",
      charactersComment: "",
      dialogueScore: "",
      dialogueComment: "",
      craftVoiceScore: "",
      craftVoiceComment: "",
      overallComment: ""
    });
    setReviewModalOpen(true);
  }

  async function handleSubmitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewTarget) return;
    setSubmittingReview(true);
    try {
      const response = await fetch(`/api/v1/feedback/reviews/${encodeURIComponent(reviewTarget.id)}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          rubric: {
            storyStructure: { score: Number(rubricForm.storyStructureScore), comment: rubricForm.storyStructureComment },
            characters: { score: Number(rubricForm.charactersScore), comment: rubricForm.charactersComment },
            dialogue: { score: Number(rubricForm.dialogueScore), comment: rubricForm.dialogueComment },
            craftVoice: { score: Number(rubricForm.craftVoiceScore), comment: rubricForm.craftVoiceComment }
          },
          overallComment: rubricForm.overallComment
        })
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to submit review.");
        return;
      }
      toast.success("Review submitted! You earned 1 token.");
      setReviewModalOpen(false);
      setReviewTarget(null);
      await Promise.all([loadListings(), loadBalance()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit review.");
    } finally {
      setSubmittingReview(false);
    }
  }

  function openRatingModal(reviewId: string) {
    setRatingReviewId(reviewId);
    setRatingScore("");
    setRatingComment("");
    setRatingModalOpen(true);
  }

  async function handleSubmitRating(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingRating(true);
    try {
      const response = await fetch(`/api/v1/feedback/reviews/${encodeURIComponent(ratingReviewId)}/rate`, {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ score: Number(ratingScore), comment: ratingComment })
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to submit rating.");
        return;
      }
      toast.success("Rating submitted. Thank you for your feedback!");
      setRatingModalOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit rating.");
    } finally {
      setSubmittingRating(false);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "available", label: "Available" },
    { key: "my-listings", label: "My Listings" },
    { key: "my-reviews", label: "My Reviews" }
  ];

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow">Feedback Exchange</p>
        <h1 className="text-4xl text-ink-900">Give feedback, get feedback</h1>
        <p className="max-w-3xl text-ink-700">
          Earn tokens by reviewing others&rsquo; scripts, then spend tokens to get structured feedback on your own work.
          Every review uses a rubric covering story structure, characters, dialogue, and craft.
        </p>
        <div className="mt-4 inline-form">
          {balance !== null ? (
            <span className="badge">
              {balance} {balance === 1 ? "token" : "tokens"} available
            </span>
          ) : (
            <span className="badge">Sign in for tokens</span>
          )}
        </div>
      </article>

      {signedInUserId ? (
        <article className="panel stack animate-in animate-in-delay-1">
          <div className="subcard-header">
            <h2 className="section-title">Create a listing</h2>
            <span className="text-xs text-ink-500">Costs 1 token</span>
          </div>
          {createOpen ? (
            <form className="stack" onSubmit={handleCreateListing}>
              {projects.length > 0 ? (
                <div className="grid-three">
                  <label className="stack-tight">
                    <span>Project</span>
                    <select
                      className="input"
                      value={selectedProjectId}
                      onChange={(e) => handleProjectSelect(e.target.value)}
                    >
                      <option value="">Select a project...</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                  </label>
                  <label className="stack-tight">
                    <span>Draft</span>
                    {drafts.length > 0 ? (
                      <select
                        className="input"
                        onChange={(e) => handleDraftSelect(e.target.value)}
                      >
                        <option value="">Select a draft...</option>
                        {drafts.map((d) => (
                          <option key={d.id} value={d.id}>{d.versionLabel} ({d.pageCount} pp)</option>
                        ))}
                      </select>
                    ) : selectedProjectId ? (
                      <span className="text-xs text-ink-500 py-2">No drafts — upload one on the Projects page</span>
                    ) : (
                      <span className="text-xs text-ink-500 py-2">Select a project first</span>
                    )}
                  </label>
                  <label className="stack-tight">
                    <span>Page count</span>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={createForm.pageCount}
                      onChange={(e) => setCreateForm((f) => ({ ...f, pageCount: e.target.value }))}
                    />
                  </label>
                </div>
              ) : null}

              {projects.length > 0 && !selectedProjectId ? (
                <div className="rounded-lg border border-dashed border-ink-500/20 p-4">
                  <p className="text-sm text-ink-700">
                    Or upload a new manuscript:
                  </p>
                </div>
              ) : null}

              {projects.length === 0 || (projects.length > 0 && !selectedProjectId) ? (
                <div className="rounded-lg border border-dashed border-ink-500/20 bg-cream-50 p-4 stack-tight">
                  <label className="stack-tight">
                    <span className="text-sm font-medium text-ink-900">
                      {projects.length === 0 ? "Upload your manuscript" : "Upload a new manuscript"}
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.txt,.fdx,.doc,.docx"
                      className="input text-sm"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setUploadFile(file);
                      }}
                    />
                  </label>
                  {uploadFile ? (
                    <p className="text-xs text-tide-700">
                      {uploadFile.name} ({(uploadFile.size / 1024).toFixed(0)} KB) — will be uploaded when you submit
                    </p>
                  ) : null}
                  {uploadStep !== "idle" && uploadStep !== "done" ? (
                    <p className="text-xs text-amber-700 font-medium">{uploadStepLabels[uploadStep]}</p>
                  ) : null}
                  <label className="stack-tight">
                    <span className="text-xs text-ink-500">Page count</span>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={createForm.pageCount}
                      onChange={(e) => setCreateForm((f) => ({ ...f, pageCount: e.target.value }))}
                    />
                  </label>
                </div>
              ) : null}
              <label className="stack-tight">
                <span>Title</span>
                <input
                  className="input"
                  value={createForm.title}
                  onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="My Screenplay"
                  required
                />
              </label>
              <label className="stack-tight">
                <span>Description</span>
                <textarea
                  className="input min-h-20"
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What kind of feedback are you looking for?"
                  maxLength={2000}
                />
              </label>
              <div className="grid-three">
                <label className="stack-tight">
                  <span>Genre</span>
                  <input
                    className="input"
                    value={createForm.genre}
                    onChange={(e) => setCreateForm((f) => ({ ...f, genre: e.target.value }))}
                    placeholder="drama / comedy"
                    required
                  />
                </label>
                <label className="stack-tight">
                  <span>Format</span>
                  <input
                    className="input"
                    value={createForm.format}
                    onChange={(e) => setCreateForm((f) => ({ ...f, format: e.target.value }))}
                    placeholder="feature / tv / short"
                    required
                  />
                </label>
              </div>
              <div className="inline-form">
                <button type="submit" className="btn btn-primary" disabled={creating || (balance !== null && balance < 1)}>
                  {creating ? "Creating..." : "List for Feedback (1 token)"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={balance !== null && balance < 1}
              onClick={() => setCreateOpen(true)}
            >
              {balance !== null && balance < 1
                ? "Not enough tokens — review scripts to earn more"
                : "Request feedback on a script"}
            </button>
          )}
        </article>
      ) : null}

      <article className="panel stack animate-in animate-in-delay-2">
        <nav className="flex gap-2 border-b border-ink-500/15 pb-3">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={
                activeTab === tab.key
                  ? "rounded-md border border-ember-500/40 bg-ember-500/10 px-3 py-1.5 text-xs font-semibold text-ember-700"
                  : "rounded-md border border-transparent px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-ink-500/20 hover:bg-cream-100"
              }
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="stack">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : activeTab === "available" ? (
          listings.length === 0 ? (
            <EmptyState
              illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-ink-900" />}
              title="No scripts awaiting feedback"
              description="Check back later or encourage fellow writers to list their work."
            />
          ) : (
            <div className="stack">
              {listings.map((listing) => {
                const dl = describeDeadline(listing.expiresAt);
                return (
                  <article key={listing.id} className="subcard">
                    <div className="flex gap-4">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-lg font-bold text-violet-700">
                        {listing.title.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="subcard-header">
                          <strong className="text-lg text-ink-900">{listing.title}</strong>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${urgencyColors[dl.urgency]}`}>
                            {dl.label}
                          </span>
                        </div>
                        {listing.description ? (
                          <p className="mt-1 text-sm text-ink-700 line-clamp-2">{listing.description}</p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="badge">{listing.genre}</span>
                          <span className="badge">{listing.format}</span>
                          {listing.pageCount > 0 ? (
                            <span className="badge">{listing.pageCount} pages</span>
                          ) : null}
                        </div>
                        {signedInUserId && listing.ownerUserId !== signedInUserId ? (
                          <div className="mt-3">
                            <button type="button" className="btn btn-primary" onClick={() => handleClaim(listing.id)}>
                              Claim &amp; review
                            </button>
                          </div>
                        ) : listing.ownerUserId === signedInUserId ? (
                          <p className="mt-2 text-xs text-ink-500">Your listing</p>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : activeTab === "my-listings" ? (
          !signedInUserId ? (
            <EmptyState
              illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-ink-900" />}
              title="Sign in to see your listings"
              description="Your feedback listings will appear here."
            />
          ) : myListings.length === 0 ? (
            <EmptyState
              illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-ink-900" />}
              title="No listings yet"
              description="Create a listing above to request feedback on your script."
            />
          ) : (
            <div className="stack">
              {myListings.map((listing) => (
                <article key={listing.id} className="subcard">
                  <div className="subcard-header">
                    <strong className="text-ink-900">{listing.title}</strong>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${statusColors[listing.status] ?? statusColors.open}`}>
                      {listing.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="badge">{listing.genre}</span>
                    <span className="badge">{listing.format}</span>
                  </div>
                  <div className="mt-3 inline-form">
                    {listing.status === "open" ? (
                      <button type="button" className="btn btn-secondary" onClick={() => handleCancel(listing.id)}>
                        Cancel &amp; refund
                      </button>
                    ) : null}
                    {listing.status === "completed" ? (
                      <button type="button" className="btn btn-secondary" onClick={() => openRatingModal(`review_for_${listing.id}`)}>
                        Rate review
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )
        ) : !signedInUserId ? (
          <EmptyState
            illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-ink-900" />}
            title="Sign in to see your reviews"
            description="Reviews you claim will appear here."
          />
        ) : myReviews.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-ink-900" />}
            title="No reviews yet"
            description="Claim a listing above to start reviewing scripts."
          />
        ) : (
          <div className="stack">
            {myReviews.map((review) => {
              const listing = [...listings, ...myListings].find((l) => l.id === review.listingId);
              const dl = listing?.reviewDeadline ? describeDeadline(listing.reviewDeadline) : null;
              return (
                <article key={review.id} className="subcard">
                  <div className="flex gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-tide-500/10 text-lg font-bold text-tide-700">
                      R
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="subcard-header">
                        <strong className="text-ink-900">{listing?.title ?? review.listingId}</strong>
                        <div className="flex items-center gap-2">
                          {dl ? (
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${urgencyColors[dl.urgency]}`}>
                              {dl.label}
                            </span>
                          ) : null}
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${statusColors[review.status] ?? statusColors.open}`}>
                            {review.status === "in_progress" ? "In Progress" : review.status}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 inline-form">
                        {listing?.scriptId ? (
                          <a
                            href={`/projects/${encodeURIComponent(listing.scriptId)}/viewer`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary"
                          >
                            View Script
                          </a>
                        ) : null}
                        {review.status === "in_progress" ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => openReviewModal(review)}
                          >
                            Submit Review
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </article>

      <Modal open={reviewModalOpen} onClose={() => setReviewModalOpen(false)} title="Submit Review">
        <form className="stack" onSubmit={handleSubmitReview}>
          {(["storyStructure", "characters", "dialogue", "craftVoice"] as const).map((category) => {
            const labels: Record<string, string> = {
              storyStructure: "Story Structure",
              characters: "Characters",
              dialogue: "Dialogue",
              craftVoice: "Craft & Voice"
            };
            const scoreKey = `${category}Score` as keyof typeof rubricForm;
            const commentKey = `${category}Comment` as keyof typeof rubricForm;
            return (
              <fieldset key={category} className="rounded-lg border border-ink-500/15 p-4">
                <legend className="px-2 text-sm font-semibold text-ink-900">{labels[category]}</legend>
                <div className="stack-tight">
                  <label className="stack-tight">
                    <span className="text-xs text-ink-500">Score (1-5)</span>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={5}
                      value={rubricForm[scoreKey]}
                      onChange={(e) => setRubricForm((f) => ({ ...f, [scoreKey]: e.target.value }))}
                      required
                    />
                  </label>
                  <label className="stack-tight">
                    <span className="text-xs text-ink-500">Comment</span>
                    <textarea
                      className="input min-h-16"
                      value={rubricForm[commentKey]}
                      onChange={(e) => setRubricForm((f) => ({ ...f, [commentKey]: e.target.value }))}
                      required
                      maxLength={2000}
                    />
                  </label>
                </div>
              </fieldset>
            );
          })}
          <label className="stack-tight">
            <span>Overall comment</span>
            <textarea
              className="input min-h-20"
              value={rubricForm.overallComment}
              onChange={(e) => setRubricForm((f) => ({ ...f, overallComment: e.target.value }))}
              maxLength={5000}
            />
          </label>
          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={submittingReview}>
              {submittingReview ? "Submitting..." : "Submit Review"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={ratingModalOpen} onClose={() => setRatingModalOpen(false)} title="Rate this review">
        <form className="stack" onSubmit={handleSubmitRating}>
          <label className="stack-tight">
            <span>Score (1-5)</span>
            <input
              className="input"
              type="number"
              min={1}
              max={5}
              value={ratingScore}
              onChange={(e) => setRatingScore(e.target.value)}
              required
            />
          </label>
          <label className="stack-tight">
            <span>Comment (optional)</span>
            <textarea
              className="input min-h-16"
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              maxLength={1000}
            />
          </label>
          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={submittingRating}>
              {submittingRating ? "Submitting..." : "Submit Rating"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
