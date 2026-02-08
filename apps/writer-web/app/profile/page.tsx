"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { WriterProfile, WriterProfileUpdateRequest } from "@script-manifest/contracts";
import { getAuthHeaders, readStoredSession } from "../lib/authSession";

type EditableProfile = {
  displayName: string;
  bio: string;
  genres: string;
  representationStatus: WriterProfile["representationStatus"];
};

const initialDraft: EditableProfile = {
  displayName: "",
  bio: "",
  genres: "",
  representationStatus: "unrepresented"
};

export default function ProfilePage() {
  const [writerId, setWriterId] = useState("");
  const [profile, setProfile] = useState<WriterProfile | null>(null);
  const [draft, setDraft] = useState<EditableProfile>(initialDraft);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function loadProfile(explicitWriterId?: string) {
    const targetWriterId = explicitWriterId ?? writerId;
    if (!targetWriterId.trim()) {
      setStatus("Sign in to load your profile.");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const response = await fetch(`/api/v1/profiles/${encodeURIComponent(targetWriterId)}`, {
        cache: "no-store",
        headers: getAuthHeaders()
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus(body.error ? `Error: ${body.error}` : "Profile load failed.");
        return;
      }

      const nextProfile = body.profile as WriterProfile;
      setProfile(nextProfile);
      setDraft({
        displayName: nextProfile.displayName,
        bio: nextProfile.bio,
        genres: nextProfile.genres.join(", "),
        representationStatus: nextProfile.representationStatus
      });
      setStatus("Profile loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const session = readStoredSession();
    if (!session) {
      setStatus("Sign in to load your profile.");
      return;
    }

    setWriterId(session.user.id);
    void loadProfile(session.user.id);
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!writerId.trim()) {
      setStatus("Sign in to update your profile.");
      return;
    }

    setLoading(true);
    setStatus("");

    const payload: WriterProfileUpdateRequest = {
      displayName: draft.displayName,
      bio: draft.bio,
      genres: draft.genres
        .split(",")
        .map((genre) => genre.trim())
        .filter(Boolean),
      representationStatus: draft.representationStatus
    };

    try {
      const response = await fetch(`/api/v1/profiles/${encodeURIComponent(writerId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus(body.error ? `Error: ${body.error}` : "Profile save failed.");
        return;
      }

      const updated = body.profile as WriterProfile;
      setProfile(updated);
      setDraft({
        displayName: updated.displayName,
        bio: updated.bio,
        genres: updated.genres.join(", "),
        representationStatus: updated.representationStatus
      });
      setStatus("Profile saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4">
      <article className="hero-card">
        <p className="eyebrow">Writer Profile</p>
        <h1 className="text-4xl text-ink-900">Your public writer resume</h1>
        <p className="max-w-2xl text-ink-700">
          Keep bio, genre focus, and representation status current. This profile underpins search,
          discovery, and future ranking surfaces.
        </p>
        <div className="inline-form">
          <span className="badge">Writer ID: {writerId || "Not signed in"}</span>
          <button type="button" className="btn btn-secondary" onClick={() => void loadProfile()} disabled={loading || !writerId}>
            {loading ? "Refreshing..." : "Refresh profile"}
          </button>
        </div>
      </article>

      {!writerId ? (
        <article className="empty-state">
          Sign in first to load and edit your profile.
        </article>
      ) : null}

      {profile ? (
        <article className="panel">
          <form className="stack" onSubmit={saveProfile}>
            <div className="grid-two">
              <label className="stack-tight">
                <span>Display name</span>
                <input
                  className="input"
                  value={draft.displayName}
                  onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
                  required
                />
              </label>

              <label className="stack-tight">
                <span>Representation status</span>
                <select
                  className="input"
                  value={draft.representationStatus}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      representationStatus: event.target.value as WriterProfile["representationStatus"]
                    }))
                  }
                >
                  <option value="unrepresented">Unrepresented</option>
                  <option value="seeking_rep">Seeking rep</option>
                  <option value="represented">Represented</option>
                </select>
              </label>
            </div>

            <label className="stack-tight">
              <span>Bio</span>
              <textarea
                className="input textarea"
                value={draft.bio}
                onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
                rows={6}
                placeholder="Add a short professional bio."
              />
            </label>

            <label className="stack-tight">
              <span>Genres (comma separated)</span>
              <input
                className="input"
                value={draft.genres}
                onChange={(event) => setDraft((current) => ({ ...current, genres: event.target.value }))}
                placeholder="Drama, Thriller"
              />
            </label>

            <div className="inline-form">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Saving..." : "Save profile"}
              </button>
            </div>
          </form>
        </article>
      ) : null}

      {status ? <p className={status.startsWith("Error:") ? "status-error" : "status-note"}>{status}</p> : null}
    </section>
  );
}
