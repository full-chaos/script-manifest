"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type { Competition, SavedCompetition } from "@script-manifest/contracts";
import { Modal } from "../components/modal";
import { EmptyState } from "../components/emptyState";
import { EmptyIllustration } from "../components/illustrations";
import { SkeletonCard } from "../components/skeleton";
import { useToast } from "../components/toast";
import { useAuth } from "../lib/AuthProvider";
import { fetcher, ApiError } from "../lib/fetcher";
import { useClock } from "../lib/useClock";

type Filters = {
  query: string;
  format: string;
  genre: string;
  maxFeeUsd: string;
  location: string;
  language: string;
  feeTier: string;
};

const initialFilters: Filters = {
  query: "",
  format: "",
  genre: "",
  maxFeeUsd: "",
  location: "",
  language: "",
  feeTier: ""
};

type DeadlineInfo = {
  label: string;
  urgency: "closed" | "urgent" | "approaching" | "comfortable";
};

function describeDeadline(deadline: string): DeadlineInfo {
  const deltaMs = new Date(deadline).getTime() - Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  if (deltaMs < 0) {
    return { label: "Closed", urgency: "closed" };
  }

  const daysRemaining = Math.ceil(deltaMs / dayMs);
  if (daysRemaining === 0) {
    return { label: "Due today", urgency: "urgent" };
  }

  if (daysRemaining === 1) {
    return { label: "Due in 1 day", urgency: "urgent" };
  }

  if (daysRemaining <= 7) {
    return { label: `${daysRemaining as number} days left`, urgency: "urgent" };
  }

  if (daysRemaining <= 30) {
    return { label: `${daysRemaining as number} days left`, urgency: "approaching" };
  }

  return { label: `${daysRemaining as number} days left`, urgency: "comfortable" };
}

const urgencyColors: Record<DeadlineInfo["urgency"], string> = {
  closed: "border-border/65 bg-ink-500/10 text-muted",
  urgent: "border-red-400/60 dark:border-red-300/45 bg-red-500/10 dark:bg-red-500/15 text-red-700 dark:text-red-300",
  approaching: "border-amber-400/60 dark:border-amber-300/45 bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-500",
  comfortable: "border-tide-500/30 dark:border-tide-500/40 bg-tide-500/10 dark:bg-tide-500/20 text-tide-700 dark:text-tide-500"
};

function competitionInitial(title: string): string {
  return title.charAt(0).toUpperCase();
}

type CompetitionsResponse = {
  competitions: Competition[];
};

type SavedCompetitionsResponse = {
  savedCompetitions: SavedCompetition[];
};

function buildKey(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set("query", filters.query.trim());
  if (filters.format.trim()) params.set("format", filters.format.trim());
  if (filters.genre.trim()) params.set("genre", filters.genre.trim());
  if (filters.maxFeeUsd.trim()) params.set("maxFeeUsd", filters.maxFeeUsd.trim());
  if (filters.location.trim()) params.set("location", filters.location.trim());
  if (filters.language.trim()) params.set("language", filters.language.trim());
  if (filters.feeTier.trim()) params.set("feeTier", filters.feeTier.trim());
  return `/api/v1/competitions?${params.toString()}`;
}

export default function CompetitionsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const signedInUserId = user?.id ?? "";

  const [pendingFilters, setPendingFilters] = useState<Filters>(initialFilters);
  const [committedFilters, setCommittedFilters] = useState<Filters>(initialFilters);
  const [status, setStatus] = useState("");
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [reminderTargetUserId, setReminderTargetUserId] = useState("");
  const [reminderMessage, setReminderMessage] = useState("");
  const [sendingReminder, setSendingReminder] = useState(false);

  const now = useClock(60_000);

  const { trigger: pingOnboarding } = useSWRMutation(
    "/api/v1/onboarding-progress",
    async (url: string) => {
      await fetch(url, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competitionsVisited: true }),
      });
    },
  );
  useEffect(() => {
    if (!user) return;
    void pingOnboarding();
  }, [user, pingOnboarding]);

  const { data, isLoading: loading } = useSWR<CompetitionsResponse>(
    buildKey(committedFilters),
    fetcher,
    {
      onSuccess(d) {
        setStatus(`Found ${d.competitions.length} competitions.`);
      },
      onError(err: unknown) {
        toast.error(err instanceof ApiError ? err.message : "Competition search failed.");
      },
    }
  );

  const { data: savedData, mutate: mutateSaved } = useSWR<SavedCompetitionsResponse>(
    signedInUserId ? "/api/v1/writers/me/saved-competitions" : null,
    fetcher,
    { shouldRetryOnError: false }
  );

  const results = useMemo(() => data?.competitions ?? [], [data]);
  const savedCompetitionIds = useMemo(() => new Set((savedData?.savedCompetitions ?? []).map((saved) => saved.competitionId)), [savedData]);
  const hasSearched = data !== undefined;

  const upcomingDeadlines = useMemo(() => {
    return [...results]
      .map((competition) => ({
        competition,
        deadlineAt: new Date(competition.deadline).getTime()
      }))
      .filter((entry) => Number.isFinite(entry.deadlineAt) && entry.deadlineAt >= now)
      .sort((left, right) => left.deadlineAt - right.deadlineAt)
      .slice(0, 8)
      .map((entry) => entry.competition);
  }, [results, now]);

  function search(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setCommittedFilters(pendingFilters);
  }

  function openReminderModal(competition: Competition) {
    setSelectedCompetition(competition);
    setReminderTargetUserId(signedInUserId);
    setReminderMessage("");
    setStatus("");
    setReminderModalOpen(true);
  }

  function closeReminderModal() {
    setReminderModalOpen(false);
    setSelectedCompetition(null);
  }

  async function sendReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedCompetition) {
      setStatus("Select a competition before sending a reminder.");
      return;
    }

    const targetUserId = reminderTargetUserId.trim();
    if (!targetUserId) {
      setStatus("Target user ID is required.");
      return;
    }

    setSendingReminder(true);
    setStatus("");

    try {
      const response = await fetch(
        `/api/v1/competitions/${encodeURIComponent(selectedCompetition.id)}/deadline-reminders`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            targetUserId,
            actorUserId: signedInUserId || undefined,
            deadlineAt: selectedCompetition.deadline,
            message: reminderMessage.trim() || undefined
          })
        }
      );

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setStatus(body.error ? `Error: ${body.error}` : "Reminder request failed.");
        return;
      }

      toast.success(`Reminder scheduled for ${selectedCompetition.title}.`);
      closeReminderModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reminder request failed.");
    } finally {
      setSendingReminder(false);
    }
  }

  async function toggleSavedCompetition(competition: Competition) {
    if (!signedInUserId) {
      toast.error("Sign in to save competitions.");
      return;
    }

    const isSaved = savedCompetitionIds.has(competition.id);
    try {
      const response = await fetch(`/api/v1/competitions/${encodeURIComponent(competition.id)}/save`, {
        method: isSaved ? "DELETE" : "POST",
        headers: isSaved ? undefined : { "content-type": "application/json" },
        body: isSaved ? undefined : JSON.stringify({ remindDaysBefore: [14, 7, 1] })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Save update failed.");
        return;
      }
      await mutateSaved();
      toast.success(isSaved ? `Removed ${competition.title}.` : `Saved ${competition.title}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save update failed.");
    }
  }

  return (
    <section className="space-y-4">
      <article className="hero-card animate-in">
        <p className="eyebrow">Competition Directory</p>
        <h1 className="text-4xl text-foreground">A vetted directory, not a random spreadsheet</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Filter by format, genre, fee, and deadline to find opportunities without manually
          cross-referencing dozens of websites.
        </p>
        <div className="mt-4 inline-form">
          <span className="badge">{signedInUserId ? "Reminders enabled" : "Sign in for reminders"}</span>
        </div>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <form className="stack" onSubmit={search}>
          <label className="stack-tight">
            <span>Keyword</span>
            <input
              className="input"
              value={pendingFilters.query}
              onChange={(event) => setPendingFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Title or description"
            />
          </label>

          <div className="grid-three">
            <label className="stack-tight">
              <span>Format</span>
              <input
                className="input"
                value={pendingFilters.format}
                onChange={(event) => setPendingFilters((current) => ({ ...current, format: event.target.value }))}
                placeholder="feature / tv / short"
              />
            </label>
            <label className="stack-tight">
              <span>Genre</span>
              <input
                className="input"
                value={pendingFilters.genre}
                onChange={(event) => setPendingFilters((current) => ({ ...current, genre: event.target.value }))}
                placeholder="drama / comedy"
              />
            </label>
            <label className="stack-tight">
              <span>Max fee (USD)</span>
              <input
                className="input"
                type="number"
                min={0}
                value={pendingFilters.maxFeeUsd}
                onChange={(event) => setPendingFilters((current) => ({ ...current, maxFeeUsd: event.target.value }))}
              />
            </label>
            <label className="stack-tight">
              <span>Location</span>
              <select
                className="input"
                value={pendingFilters.location}
                onChange={(event) => setPendingFilters((current) => ({ ...current, location: event.target.value }))}
              >
                <option value="">Any location</option>
                <option value="Worldwide">Worldwide</option>
                <option value="US/Canada">US/Canada</option>
                <option value="UK">UK</option>
              </select>
            </label>
            <label className="stack-tight">
              <span>Language</span>
              <select
                className="input"
                value={pendingFilters.language}
                onChange={(event) => setPendingFilters((current) => ({ ...current, language: event.target.value }))}
              >
                <option value="">Any language</option>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>
            </label>
          </div>

          <div className="inline-form" aria-label="Fee tier filters">
            {([
              ["", "Any fee"],
              ["free", "Free"],
              ["low", "<$30"],
              ["mid", "<$70"],
              ["high", "$70+"]
            ] as Array<[string, string]>).map(([value, label]) => (
              <button
                key={value || "any"}
                type="button"
                className={pendingFilters.feeTier === value ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                onClick={() => setPendingFilters((current) => ({ ...current, feeTier: value }))}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setPendingFilters(initialFilters);
                setCommittedFilters(initialFilters);
                setStatus("");
              }}
            >
              Reset
            </button>
          </div>
        </form>
      </article>

      <article className="panel stack">
        <div className="subcard-header">
          <h2 className="section-title">Upcoming deadlines</h2>
          <span className="badge">{upcomingDeadlines.length} upcoming</span>
        </div>
        {upcomingDeadlines.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="calendar" className="h-14 w-14 text-foreground" />}
            title="No upcoming deadlines"
            description="Search for competitions above to see their deadlines here."
          />
        ) : null}
        <ol className="stack" aria-label="Upcoming deadline calendar">
          {upcomingDeadlines.map((competition) => {
            const dl = describeDeadline(competition.deadline);
            return (
              <li key={`calendar-${competition.id}`} className="subcard">
                <div className="subcard-header">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-bold text-primary-dark dark:text-primary">
                      {competitionInitial(competition.title)}
                    </span>
                    <h3 className="text-lg text-foreground">{competition.title}</h3>
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${urgencyColors[dl.urgency]}`}>
                    {dl.label}
                  </span>
                </div>
                <p className="muted mt-2 ml-12">
                  {new Date(competition.deadline).toLocaleDateString()} · {competition.format}
                </p>
              </li>
            );
          })}
        </ol>
      </article>

      <article className="panel stack">
        <div className="subcard-header">
          <h2 className="section-title">Results</h2>
          <span className="badge">{results.length} matches</span>
        </div>
        {loading && results.length === 0 ? (
          <div className="stack">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : !loading && results.length === 0 && !hasSearched ? (
          <EmptyState
            illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />}
            title="Start exploring competitions"
            description="Use the search filters above to find screenwriting competitions, fellowships, and labs."
          />
        ) : !loading && results.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />}
            title="No matches found"
            description="Try adjusting your filters or broadening your search terms."
          />
        ) : null}
        {results.map((competition) => {
          const dl = describeDeadline(competition.deadline);
          return (
            <article key={competition.id} className="subcard">
              <div className="flex gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-lg font-bold text-primary-dark dark:text-primary">
                  {competitionInitial(competition.title)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="subcard-header">
                    <strong className="text-lg text-foreground">{competition.title}</strong>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${urgencyColors[dl.urgency]}`}>
                      {dl.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-foreground-secondary line-clamp-2">{competition.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="badge">{competition.format}</span>
                    <span className="badge">{competition.genre}</span>
                    {competition.location ? <span className="badge">{competition.location}</span> : null}
                    {competition.language ? <span className="badge">{competition.language}</span> : null}
                    {competition.feeUsd === 0 ? (
                      <span className="inline-flex items-center rounded-full border border-tide-500/30 dark:border-tide-500/40 bg-tide-500/10 dark:bg-tide-500/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-tide-700 dark:text-tide-500">
                        Free
                      </span>
                    ) : (
                      <span className="badge">${competition.feeUsd} entry fee</span>
                    )}
                  </div>
                  <div className="mt-3 inline-form">
                    {signedInUserId ? (
                      <button
                        type="button"
                        className={savedCompetitionIds.has(competition.id) ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                        onClick={() => void toggleSavedCompetition(competition)}
                      >
                        {savedCompetitionIds.has(competition.id) ? "Saved" : "Save"}
                      </button>
                    ) : null}
                    {signedInUserId ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => openReminderModal(competition)}
                      >
                        Set reminder
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </article>

      <Modal
        open={reminderModalOpen}
        onClose={closeReminderModal}
        title="Set deadline reminder"
        description={
          selectedCompetition
            ? `Queue a deadline reminder event for ${selectedCompetition.title}.`
            : "Queue a deadline reminder event."
        }
      >
        {selectedCompetition ? (
          <form className="stack" onSubmit={sendReminder}>
            <label className="stack-tight">
              <span>Competition</span>
              <input className="input" value={selectedCompetition.title} disabled readOnly />
            </label>

            <label className="stack-tight">
              <span>Deadline</span>
              <input
                className="input"
                value={new Date(selectedCompetition.deadline).toLocaleString()}
                disabled
                readOnly
              />
            </label>

            <label className="stack-tight">
              <span>Target user ID</span>
              <input
                className="input"
                value={reminderTargetUserId}
                onChange={(event) => setReminderTargetUserId(event.target.value)}
                placeholder="writer_01"
                required
              />
            </label>

            <label className="stack-tight">
              <span>Message (optional)</span>
              <textarea
                className="input min-h-24"
                value={reminderMessage}
                onChange={(event) => setReminderMessage(event.target.value)}
                placeholder="Submission closes in 48 hours"
                maxLength={500}
              />
            </label>

            <div className="inline-form">
              <button type="submit" className="btn btn-primary" disabled={sendingReminder}>
                {sendingReminder ? "Sending..." : "Send reminder"}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>

      {status ? <p className={status.startsWith("Error:") ? "status-error" : "status-note"}>{status}</p> : null}
    </section>
  );
}
