"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { WriterProfile, WriterProfileUpdateRequest } from "@script-manifest/contracts";
import { getAuthHeaders, readStoredSession } from "../lib/authSession";

type EditableProfile = {
  displayName: string;
  bio: string;
  genres: string;
  demographics: string;
  representationStatus: WriterProfile["representationStatus"];
  headshotUrl: string;
  customProfileUrl: string;
  isSearchable: boolean;
};

const initialDraft: EditableProfile = {
  displayName: "",
  bio: "",
  genres: "",
  demographics: "",
  representationStatus: "unrepresented",
  headshotUrl: "",
  customProfileUrl: "",
  isSearchable: true
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
        demographics: nextProfile.demographics.join(", "),
        representationStatus: nextProfile.representationStatus,
        headshotUrl: nextProfile.headshotUrl,
        customProfileUrl: nextProfile.customProfileUrl,
        isSearchable: nextProfile.isSearchable
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
      demographics: draft.demographics
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
      representationStatus: draft.representationStatus,
      headshotUrl: draft.headshotUrl.trim(),
      customProfileUrl: draft.customProfileUrl.trim(),
      isSearchable: draft.isSearchable
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
        demographics: updated.demographics.join(", "),
        representationStatus: updated.representationStatus,
        headshotUrl: updated.headshotUrl,
        customProfileUrl: updated.customProfileUrl,
        isSearchable: updated.isSearchable
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
          Keep your bio, genres, demographics, profile links, and search visibility current.
          This profile underpins discovery and ranking surfaces.
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

            <label className="stack-tight">
              <span>Demographics (comma separated)</span>
              <input
                className="input"
                value={draft.demographics}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, demographics: event.target.value }))
                }
                placeholder="LGBTQ+, Veteran"
              />
            </label>

            <div className="grid-two">
              <label className="stack-tight">
                <span>Headshot URL</span>
                <input
                  className="input"
                  type="url"
                  value={draft.headshotUrl}
                  onChange={(event) => setDraft((current) => ({ ...current, headshotUrl: event.target.value }))}
                  placeholder="https://cdn.example.com/headshot.jpg"
                />
              </label>

              <label className="stack-tight">
                <span>Custom profile URL</span>
                <input
                  className="input"
                  type="url"
                  value={draft.customProfileUrl}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, customProfileUrl: event.target.value }))
                  }
                  placeholder="https://profiles.example.com/your-name"
                />
              </label>
            </div>

            <label className="inline-form">
              <input
                type="checkbox"
                checked={draft.isSearchable}
                onChange={(event) => setDraft((current) => ({ ...current, isSearchable: event.target.checked }))}
              />
              <span>Allow profile in search results</span>
            </label>

            {draft.headshotUrl ? (
              <div className="subcard">
                <p className="eyebrow">Headshot Preview</p>
                <img src={draft.headshotUrl} alt="Headshot preview" className="w-32 rounded-md border border-cream-300" />
              </div>
            ) : null}

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
