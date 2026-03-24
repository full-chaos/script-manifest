"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Competition } from "@script-manifest/contracts";

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

export default function AdminCompetitionsPage() {
  const [draft, setDraft] = useState<CompetitionDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rows, setRows] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function loadCompetitions() {
    setLoading(true);
    setStatus("");

    try {
      const response = await fetch("/api/v1/competitions?includeHidden=true&includeCancelled=true", { cache: "no-store" });
      const body = (await response.json()) as { competitions?: Competition[]; error?: string };
      if (!response.ok) {
        setStatus(body.error ? `Error: ${body.error}` : "Unable to load competitions.");
        return;
      }

      setRows(body.competitions ?? []);
      setStatus(`Loaded ${body.competitions?.length ?? 0} competitions.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCompetitions();
  }, []);

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
    setLoading(true);
    setStatus("");

    const payload = {
      id: editingId ?? crypto.randomUUID(),
      title: draft.title.trim(),
      description: draft.description.trim(),
      format: draft.format.trim(),
      genre: draft.genre.trim(),
      feeUsd: Number(draft.feeUsd),
      deadline: new Date(draft.deadline).toISOString()
    };

    try {
      const url = editingId
        ? `/api/v1/admin/competitions/${encodeURIComponent(editingId)}`
        : "/api/v1/admin/competitions";
      const method = editingId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus(body.error ? `Error: ${body.error}` : `${editingId ? "Update" : "Create"} failed.`);
        return;
      }

      setDraft(emptyDraft);
      setEditingId(null);
      await loadCompetitions();
      setStatus(editingId ? `Competition "${payload.title}" updated.` : `Competition "${payload.title}" created.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  async function cancelCompetition(id: string) {
    if (!window.confirm("Are you sure you want to cancel this competition? This action cannot be undone.")) return;
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch(`/api/v1/admin/competitions/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus(body.error ? `Error: ${body.error}` : "Cancel failed.");
        return;
      }
      await loadCompetitions();
      setStatus("Competition cancelled.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  async function toggleVisibility(id: string, currentVisibility: string) {
    setLoading(true);
    setStatus("");
    const newVisibility = currentVisibility === "listed" ? "unlisted" : "listed";
    try {
      const response = await fetch(`/api/v1/admin/competitions/${encodeURIComponent(id)}/visibility`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visibility: newVisibility })
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus(body.error ? `Error: ${body.error}` : "Visibility update failed.");
        return;
      }
      await loadCompetitions();
      setStatus(`Competition visibility set to ${newVisibility}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  async function toggleAccessType(id: string, currentAccessType: string) {
    setLoading(true);
    setStatus("");
    const newAccessType = currentAccessType === "open" ? "invite_only" : "open";
    try {
      const response = await fetch(`/api/v1/admin/competitions/${encodeURIComponent(id)}/access-type`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessType: newAccessType })
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus(body.error ? `Error: ${body.error}` : "Access type update failed.");
        return;
      }
      await loadCompetitions();
      setStatus(`Competition access type set to ${newAccessType}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
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
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Saving..." : editingId ? "Update competition" : "Create competition"}
            </button>
          </div>
        </form>
      </article>

      <article className="panel stack">
        <h2 className="section-title">Current competitions</h2>
        {rows.length === 0 ? <p className="empty-state">No competitions available.</p> : null}
        {rows.map((competition) => (
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
                disabled={loading || editingId === competition.id}
              >
                {editingId === competition.id ? "Editing..." : "Edit"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => toggleVisibility(competition.id, competition.visibility)}
                disabled={loading}
              >
                {competition.visibility === "listed" ? "Hide" : "Show"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => toggleAccessType(competition.id, competition.accessType)}
                disabled={loading}
              >
                {competition.accessType === "open" ? "Make Invite-Only" : "Make Open"}
              </button>
              <button
                type="button"
                className="btn btn-destructive"
                style={{ color: "#ef4444", borderColor: "#ef4444" }}
                onClick={() => cancelCompetition(competition.id)}
                disabled={loading || competition.status === "cancelled"}
              >
                Cancel
              </button>
            </div>
          </article>
        ))}
      </article>

      {status ? <p className={status.startsWith("Error:") ? "status-error" : "status-note"}>{status}</p> : null}
    </section>
  );
}
