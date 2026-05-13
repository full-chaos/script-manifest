"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type { Competition } from "@script-manifest/contracts";
import { fetcher, ApiError } from "../../lib/fetcher";
import { useToast } from "../../components/toast";

type CompetitionDraft = {
  title: string;
  description: string;
  format: string;
  genre: string;
  feeUsd: string;
  deadline: string;
};

const emptyDraft: CompetitionDraft = {
  title: "",
  description: "",
  format: "feature",
  genre: "drama",
  feeUsd: "0",
  deadline: ""
};

function toLocalDatetime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function competitionToDraft(c: Competition): CompetitionDraft {
  return {
    title: c.title,
    description: c.description,
    format: c.format,
    genre: c.genre,
    feeUsd: String(c.feeUsd),
    deadline: toLocalDatetime(c.deadline),
  };
}

const LIST_KEY = "/api/v1/competitions?includeHidden=true&includeCancelled=true";

type SaveArg = {
  payload: {
    id: string;
    title: string;
    description: string;
    format: string;
    genre: string;
    feeUsd: number;
    deadline: string;
  };
  editingId: string | null;
};

async function saveFetcher(
  _key: string,
  { arg }: { arg: SaveArg }
): Promise<{ competition: Competition }> {
  const { payload, editingId } = arg;
  const url = editingId
    ? `/api/v1/admin/competitions/${encodeURIComponent(editingId)}`
    : "/api/v1/admin/competitions";
  const method = editingId ? "PUT" : "POST";
  return fetcher<{ competition: Competition }>(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function cancelFetcher(
  _key: string,
  { arg }: { arg: { id: string } }
): Promise<{ competition: Competition }> {
  return fetcher<{ competition: Competition }>(
    `/api/v1/admin/competitions/${encodeURIComponent(arg.id)}/cancel`,
    { method: "POST" }
  );
}

async function visibilityFetcher(
  _key: string,
  { arg }: { arg: { id: string; visibility: Competition["visibility"] } }
): Promise<{ competition: Competition }> {
  return fetcher<{ competition: Competition }>(
    `/api/v1/admin/competitions/${encodeURIComponent(arg.id)}/visibility`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visibility: arg.visibility }),
    }
  );
}

async function accessTypeFetcher(
  _key: string,
  { arg }: { arg: { id: string; accessType: Competition["accessType"] } }
): Promise<{ competition: Competition }> {
  return fetcher<{ competition: Competition }>(
    `/api/v1/admin/competitions/${encodeURIComponent(arg.id)}/access-type`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessType: arg.accessType }),
    }
  );
}

export default function AdminCompetitionsPage() {
  const toast = useToast();
  const [draft, setDraft] = useState<CompetitionDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR<{ competitions: Competition[] }>(LIST_KEY);
  const competitions = data?.competitions ?? [];

  const { trigger: triggerSave, isMutating: isSaving } = useSWRMutation(LIST_KEY, saveFetcher);
  const { trigger: triggerCancel, isMutating: isCancelling } = useSWRMutation(LIST_KEY, cancelFetcher);
  const { trigger: triggerVisibility, isMutating: isTogglingVisibility } = useSWRMutation(LIST_KEY, visibilityFetcher);
  const { trigger: triggerAccessType, isMutating: isTogglingAccessType } = useSWRMutation(LIST_KEY, accessTypeFetcher);

  const isWorking = isSaving || isCancelling || isTogglingVisibility || isTogglingAccessType;

  function startEdit(competition: Competition) {
    setEditingId(competition.id);
    setDraft(competitionToDraft(competition));
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = {
      id: editingId ?? crypto.randomUUID(),
      title: draft.title.trim(),
      description: draft.description.trim(),
      format: draft.format.trim(),
      genre: draft.genre.trim(),
      feeUsd: Number(draft.feeUsd),
      deadline: new Date(draft.deadline).toISOString()
    };

    const isEditing = editingId !== null;
    try {
      await triggerSave({ payload, editingId });
      toast.success(isEditing ? `Competition "${payload.title}" updated.` : `Competition "${payload.title}" created.`);
      setDraft(emptyDraft);
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `${isEditing ? "Update" : "Create"} failed.`);
    }
  }

  async function cancelCompetition(id: string) {
    if (!window.confirm("Are you sure you want to cancel this competition? This action cannot be undone.")) return;
    try {
      await triggerCancel(
        { id },
        {
          optimisticData: (currentData: { competitions: Competition[] } | undefined) => ({
            competitions: (currentData?.competitions ?? []).map((c) =>
              c.id === id ? { ...c, status: "cancelled" as Competition["status"] } : c
            ),
          }),
          rollbackOnError: true,
        }
      );
      toast.success("Competition cancelled.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Cancel failed.");
    }
  }

  async function toggleVisibility(id: string, currentVisibility: Competition["visibility"]) {
    const newVisibility: Competition["visibility"] = currentVisibility === "listed" ? "unlisted" : "listed";
    try {
      await triggerVisibility(
        { id, visibility: newVisibility },
        {
          optimisticData: (currentData: { competitions: Competition[] } | undefined) => ({
            competitions: (currentData?.competitions ?? []).map((c) =>
              c.id === id ? { ...c, visibility: newVisibility } : c
            ),
          }),
          rollbackOnError: true,
        }
      );
      toast.success(`Competition visibility set to ${newVisibility}.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Visibility update failed.");
    }
  }

  async function toggleAccessType(id: string, currentAccessType: Competition["accessType"]) {
    const newAccessType: Competition["accessType"] = currentAccessType === "open" ? "invite_only" : "open";
    try {
      await triggerAccessType(
        { id, accessType: newAccessType },
        {
          optimisticData: (currentData: { competitions: Competition[] } | undefined) => ({
            competitions: (currentData?.competitions ?? []).map((c) =>
              c.id === id ? { ...c, accessType: newAccessType } : c
            ),
          }),
          rollbackOnError: true,
        }
      );
      toast.success(`Competition access type set to ${newAccessType}.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Access type update failed.");
    }
  }

  return (
    <section className="space-y-4">
      <article className="hero-card">
        <p className="eyebrow">Admin Curation</p>
        <h1 className="text-4xl text-foreground">Competition curation console</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Curate vetted competitions and maintain metadata quality from one controlled workflow.
        </p>
      </article>

      <article className="panel stack">
        <div className="flex items-center justify-between">
          <h2 className="section-title">{editingId ? `Editing: ${editingId}` : "Create competition"}</h2>
          {editingId ? (
            <button type="button" className="btn btn-secondary text-xs" onClick={cancelEdit}>Cancel edit</button>
          ) : null}
        </div>
        <form className="stack" onSubmit={handleSubmit}>
          <label className="stack-tight">
            <span>Title</span>
            <input className="input" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} required />
          </label>

          <label className="stack-tight">
            <span>Description</span>
            <textarea className="input textarea" rows={3} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
          </label>

          <div className="grid-two">
            <label className="stack-tight">
              <span>Format</span>
              <input className="input" value={draft.format} onChange={(e) => setDraft((d) => ({ ...d, format: e.target.value }))} required />
            </label>
            <label className="stack-tight">
              <span>Genre</span>
              <input className="input" value={draft.genre} onChange={(e) => setDraft((d) => ({ ...d, genre: e.target.value }))} required />
            </label>
          </div>

          <div className="grid-two">
            <label className="stack-tight">
              <span>Fee USD</span>
              <input className="input" type="number" min={0} value={draft.feeUsd} onChange={(e) => setDraft((d) => ({ ...d, feeUsd: e.target.value }))} required />
            </label>
            <label className="stack-tight">
              <span>Deadline</span>
              <input className="input" type="datetime-local" value={draft.deadline} onChange={(e) => setDraft((d) => ({ ...d, deadline: e.target.value }))} required />
            </label>
          </div>

          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={isWorking}>
              {isSaving ? "Saving..." : editingId ? "Update competition" : "Create competition"}
            </button>
          </div>
        </form>
      </article>

      <article className="panel stack">
        <h2 className="section-title">Current competitions</h2>
        {isLoading ? (
          <p className="status-note">Loading...</p>
        ) : error ? (
          <p className="status-error">
            {error instanceof ApiError ? error.message : "Unable to load competitions."}
          </p>
        ) : (
          <>
            <p className="status-note">Loaded {competitions.length} competitions.</p>
            {competitions.length === 0 ? <p className="empty-state">No competitions available.</p> : null}
            {competitions.map((competition) => (
              <article key={competition.id} className={`subcard ${competition.status === "cancelled" ? "opacity-50" : ""}`}>
                <div className="subcard-header">
                  <strong className={competition.status === "cancelled" ? "line-through" : ""}>{competition.title}</strong>
                  <div className="flex gap-2 items-center">
                    <span className="badge">{competition.id}</span>
                    <span className="badge">{competition.status}</span>
                    <span className="badge">{competition.visibility}</span>
                    <span className="badge">{competition.accessType}</span>
                  </div>
                </div>
                {competition.description ? (
                  <p className="mt-1 text-sm text-foreground-secondary line-clamp-2">{competition.description}</p>
                ) : null}
                <p className="muted mt-2">
                  {competition.format} | {competition.genre} | ${competition.feeUsd} | {new Date(competition.deadline).toLocaleDateString()}
                </p>
                <div className="inline-form mt-3">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => startEdit(competition)}
                    disabled={isWorking || editingId === competition.id}
                  >
                    {editingId === competition.id ? "Editing..." : "Edit"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void toggleVisibility(competition.id, competition.visibility)}
                    disabled={isWorking}
                  >
                    {competition.visibility === "listed" ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void toggleAccessType(competition.id, competition.accessType)}
                    disabled={isWorking}
                  >
                    {competition.accessType === "open" ? "Make Invite-Only" : "Make Open"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-destructive"
                    style={{ color: "#ef4444", borderColor: "#ef4444" }}
                    onClick={() => void cancelCompetition(competition.id)}
                    disabled={isWorking || competition.status === "cancelled"}
                  >
                    Cancel
                  </button>
                </div>
              </article>
            ))}
          </>
        )}
      </article>
    </section>
  );
}
