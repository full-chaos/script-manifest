"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { WriterProfile, WriterProfileUpdateRequest } from "@script-manifest/contracts";
import { getAuthHeaders, readStoredSession } from "../lib/authSession";

type EditableProfile = {
  displayName: string;
  bio: string;
  genres: string;
  representationStatus: WriterProfile["representationStatus"];
};

export default function ProfilePage() {
  const [writerId, setWriterId] = useState("");
  const [profile, setProfile] = useState<WriterProfile | null>(null);
  const [draft, setDraft] = useState<EditableProfile>({
    displayName: "",
    bio: "",
    genres: "",
    representationStatus: "unrepresented"
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const session = readStoredSession();
    if (session) {
      setWriterId(session.user.id);
    }
  }, []);

  const canLoad = useMemo(() => writerId.trim().length > 0, [writerId]);

  async function loadProfile() {
    if (!canLoad) {
      setStatus("Set a writer ID or sign in first.");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const response = await fetch(`/api/v1/profiles/${encodeURIComponent(writerId)}`, {
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

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canLoad) {
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

      setProfile(body.profile as WriterProfile);
      setStatus("Profile saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card stack">
      <h2>Writer Profile</h2>
      <p className="muted">
        Pulls from profile-project-service through gateway. Sign in first to auto-fill writer ID.
      </p>

      <div className="inline-form">
        <input
          className="input"
          value={writerId}
          onChange={(event) => setWriterId(event.target.value)}
          placeholder="writer id"
        />
        <button type="button" className="btn btn-active" onClick={loadProfile} disabled={loading}>
          {loading ? "Loading..." : "Load"}
        </button>
      </div>

      {profile ? (
        <form className="stack" onSubmit={saveProfile}>
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
            <span>Bio</span>
            <textarea
              className="input textarea"
              value={draft.bio}
              onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
              rows={5}
            />
          </label>

          <label className="stack-tight">
            <span>Genres (comma separated)</span>
            <input
              className="input"
              value={draft.genres}
              onChange={(event) => setDraft((current) => ({ ...current, genres: event.target.value }))}
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

          <button type="submit" className="btn btn-active" disabled={loading}>
            {loading ? "Saving..." : "Save profile"}
          </button>
        </form>
      ) : null}

      {status ? <p className="status-note">{status}</p> : null}
    </section>
  );
}
