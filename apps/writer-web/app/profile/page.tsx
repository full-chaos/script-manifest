"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type { WriterProfile, WriterProfileUpdateRequest } from "@script-manifest/contracts";
import { fetcher, ApiError } from "../lib/fetcher";
import { SkeletonText } from "../components/skeleton";
import { useToast } from "../components/toast";
import { useAuth } from "../lib/AuthProvider";

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
  isSearchable: true,
};

function isPreviewableImageUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function profileToDraft(p: WriterProfile): EditableProfile {
  return {
    displayName: p.displayName,
    bio: p.bio,
    genres: p.genres.join(", "),
    demographics: p.demographics.join(", "),
    representationStatus: p.representationStatus,
    headshotUrl: p.headshotUrl,
    customProfileUrl: p.customProfileUrl,
    isSearchable: p.isSearchable,
  };
}

async function putProfile(
  url: string,
  { arg }: { arg: WriterProfileUpdateRequest }
): Promise<{ profile: WriterProfile }> {
  return fetcher<{ profile: WriterProfile }>(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(arg),
  });
}

export default function ProfilePage() {
  const toast = useToast();
  const { user, loading: authLoading } = useAuth();
  const [draft, setDraft] = useState<EditableProfile>(initialDraft);
  const [exporting, setExporting] = useState<"csv" | "zip" | null>(null);

  // Auth-paused key: null while auth is resolving or no user — SWR will not fetch.
  const writerId = user?.id ?? "";
  const profileKey =
    authLoading || !writerId
      ? null
      : `/api/v1/profiles/${encodeURIComponent(writerId)}`;

  const {
    data: profileData,
    isLoading,
    mutate,
  } = useSWR<{ profile: WriterProfile }>(profileKey, {
    onSuccess(data) {
      setDraft(profileToDraft(data.profile));
    },
    onError(err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load profile.");
    },
  });

  const { trigger: triggerSave, isMutating } = useSWRMutation(
    profileKey,
    putProfile,
    {
      populateCache: true,
      revalidate: false,
      throwOnError: false,
      onSuccess(data) {
        setDraft(profileToDraft(data.profile));
        toast.success("Profile saved.");
        void fetch("/api/v1/onboarding-progress", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profileCompleted: true }),
        });
      },
      onError(err: unknown) {
        toast.error(err instanceof ApiError ? err.message : "Failed to save profile.");
      },
    }
  );

  const profile = profileData?.profile ?? null;
  const isBusy = isLoading || isMutating;

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!writerId.trim()) {
      toast.error("Sign in to update your profile.");
      return;
    }

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
      isSearchable: draft.isSearchable,
    };

    await triggerSave(payload);
  }

  async function downloadExport(format: "csv" | "zip") {
    setExporting(format);
    try {
      const response = await fetch(`/api/v1/export/${format}`, {
        headers: {},
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(
          body && typeof body === "object" && "error" in body
            ? `${(body as { error: string }).error}`
            : "Export failed."
        );
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        format === "csv"
          ? "script-manifest-export.csv"
          : "script-manifest-export.zip";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} export downloaded.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--amber animate-in">
        <p className="eyebrow eyebrow--amber">Writer Profile</p>
        <h1 className="text-4xl text-foreground">Your public writer resume</h1>
        <p className="max-w-2xl text-foreground-secondary">
          Keep your bio, genres, demographics, profile links, and search visibility current.
          This profile underpins discovery and ranking surfaces.
        </p>
        <div className="inline-form">
          <span className="badge">{writerId ? `ID: ${writerId}` : "Not signed in"}</span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void mutate()}
            disabled={isBusy || !writerId}
          >
            {isLoading ? "Refreshing..." : "Refresh profile"}
          </button>
        </div>
      </article>

      {!writerId ? (
        <article className="empty-state">
          Sign in first to load and edit your profile.
        </article>
      ) : null}

      {writerId && isLoading ? (
        <article className="panel">
          <div className="stack">
            <SkeletonText />
            <SkeletonText className="mt-4" />
          </div>
        </article>
      ) : null}

      {profile ? (
        <article className="panel">
          <form className="stack" onSubmit={handleSave}>
            <div className="grid-two">
              <label className="stack-tight">
                <span>Display name</span>
                <input
                  className="input"
                  value={draft.displayName}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, displayName: event.target.value }))
                  }
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
                      representationStatus: event.target
                        .value as WriterProfile["representationStatus"],
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
                onChange={(event) =>
                  setDraft((current) => ({ ...current, bio: event.target.value }))
                }
                rows={6}
                placeholder="Add a short professional bio."
              />
            </label>

            <label className="stack-tight">
              <span>Genres (comma separated)</span>
              <input
                className="input"
                value={draft.genres}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, genres: event.target.value }))
                }
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
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, headshotUrl: event.target.value }))
                  }
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
                onChange={(event) =>
                  setDraft((current) => ({ ...current, isSearchable: event.target.checked }))
                }
              />
              <span>Allow profile in search results</span>
            </label>

            {isPreviewableImageUrl(draft.headshotUrl) ? (
              <div className="subcard">
                <p className="eyebrow">Headshot Preview</p>
                <Image
                  src={draft.headshotUrl}
                  alt="Headshot preview"
                  width={128}
                  height={128}
                  unoptimized
                  className="w-32 rounded-md border border-cream-300"
                />
              </div>
            ) : null}

            <div className="inline-form">
              <button type="submit" className="btn btn-primary" disabled={isBusy}>
                {isMutating ? "Saving..." : "Save profile"}
              </button>
            </div>
          </form>
        </article>
      ) : null}

      {writerId ? (
        <article className="panel">
          <p className="eyebrow">Data Export</p>
          <p className="text-foreground-secondary">Download a copy of all your account data.</p>
          <div className="inline-form">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={exporting !== null}
              onClick={() => void downloadExport("csv")}
            >
              {exporting === "csv" ? "Exporting..." : "Export CSV"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={exporting !== null}
              onClick={() => void downloadExport("zip")}
            >
              {exporting === "zip" ? "Exporting..." : "Export All (ZIP)"}
            </button>
          </div>
        </article>
      ) : null}
    </section>
  );
}
