"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Competition } from "@script-manifest/contracts";
import { getAuthHeaders } from "../../lib/authSession";

type CompetitionDraft = {
  id: string;
  title: string;
  description: string;
  format: string;
  genre: string;
  feeUsd: string;
  deadline: string;
};

const initialDraft: CompetitionDraft = {
  id: "",
  title: "",
  description: "",
  format: "feature",
  genre: "drama",
  feeUsd: "0",
  deadline: ""
};

export default function AdminCompetitionsPage() {
  const [adminUserId, setAdminUserId] = useState("admin_01");
  const [draft, setDraft] = useState<CompetitionDraft>(initialDraft);
  const [rows, setRows] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function loadCompetitions() {
    setLoading(true);
    setStatus("");

    try {
      const response = await fetch("/api/v1/competitions", { cache: "no-store" });
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

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.id.trim()) {
      setStatus("Competition ID is required.");
      return;
    }

    setLoading(true);
    setStatus("");

    const payload = {
      id: draft.id.trim(),
      title: draft.title.trim(),
      description: draft.description.trim(),
      format: draft.format.trim(),
      genre: draft.genre.trim(),
      feeUsd: Number(draft.feeUsd),
      deadline: new Date(draft.deadline).toISOString()
    };

    try {
      const response = await fetch("/api/v1/admin/competitions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-user-id": adminUserId,
          ...getAuthHeaders()
        },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus(body.error ? `Error: ${body.error}` : "Create failed.");
        return;
      }

      setDraft(initialDraft);
      await loadCompetitions();
      setStatus("Competition upserted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  async function submitUpdate(competitionId: string) {
    const row = rows.find((entry) => entry.id === competitionId);
    if (!row) {
      return;
    }

    setLoading(true);
    setStatus("");
    try {
      const response = await fetch(`/api/v1/admin/competitions/${encodeURIComponent(competitionId)}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-admin-user-id": adminUserId,
          ...getAuthHeaders()
        },
        body: JSON.stringify(row)
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus(body.error ? `Error: ${body.error}` : "Update failed.");
        return;
      }

      setStatus(`Competition ${competitionId} updated.`);
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
        <h1 className="text-4xl text-ink-900">Competition curation console</h1>
        <p className="max-w-3xl text-ink-700">
          Curate vetted competitions and maintain metadata quality from one controlled workflow.
        </p>
      </article>

      <article className="panel stack">
        <div className="grid-two">
          <label className="stack-tight">
            <span>Admin user ID (allowlisted)</span>
            <input
              className="input"
              value={adminUserId}
              onChange={(event) => setAdminUserId(event.target.value)}
              placeholder="admin_01"
            />
          </label>
          <div className="inline-form">
            <button type="button" className="btn btn-secondary" onClick={() => void loadCompetitions()} disabled={loading}>
              Refresh list
            </button>
          </div>
        </div>
      </article>

      <article className="panel stack">
        <h2 className="section-title">Create or upsert competition</h2>
        <form className="stack" onSubmit={submitCreate}>
          <div className="grid-two">
            <label className="stack-tight">
              <span>ID</span>
              <input className="input" value={draft.id} onChange={(event) => setDraft((current) => ({ ...current, id: event.target.value }))} required />
            </label>
            <label className="stack-tight">
              <span>Title</span>
              <input className="input" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} required />
            </label>
          </div>

          <label className="stack-tight">
            <span>Description</span>
            <textarea className="input textarea" rows={3} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
          </label>

          <div className="grid-two">
            <label className="stack-tight">
              <span>Format</span>
              <input className="input" value={draft.format} onChange={(event) => setDraft((current) => ({ ...current, format: event.target.value }))} required />
            </label>
            <label className="stack-tight">
              <span>Genre</span>
              <input className="input" value={draft.genre} onChange={(event) => setDraft((current) => ({ ...current, genre: event.target.value }))} required />
            </label>
          </div>

          <div className="grid-two">
            <label className="stack-tight">
              <span>Fee USD</span>
              <input className="input" type="number" min={0} value={draft.feeUsd} onChange={(event) => setDraft((current) => ({ ...current, feeUsd: event.target.value }))} required />
            </label>
            <label className="stack-tight">
              <span>Deadline</span>
              <input className="input" type="datetime-local" value={draft.deadline} onChange={(event) => setDraft((current) => ({ ...current, deadline: event.target.value }))} required />
            </label>
          </div>

          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Saving..." : "Save competition"}
            </button>
          </div>
        </form>
      </article>

      <article className="panel stack">
        <h2 className="section-title">Current competitions</h2>
        {rows.length === 0 ? <p className="empty-state">No competitions available.</p> : null}
        {rows.map((competition) => (
          <article key={competition.id} className="subcard">
            <div className="subcard-header">
              <strong>{competition.title}</strong>
              <span className="badge">{competition.id}</span>
            </div>
            <p className="muted mt-2">
              {competition.format} | {competition.genre} | ${competition.feeUsd} | {new Date(competition.deadline).toLocaleDateString()}
            </p>
            <div className="inline-form mt-3">
              <button type="button" className="btn btn-secondary" onClick={() => void submitUpdate(competition.id)} disabled={loading}>
                Re-save metadata
              </button>
            </div>
          </article>
        ))}
      </article>

      {status ? <p className={status.startsWith("Error:") ? "status-error" : "status-note"}>{status}</p> : null}
    </section>
  );
}
