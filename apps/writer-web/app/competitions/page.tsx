"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Competition } from "@script-manifest/contracts";
import { Modal } from "../components/modal";
import { EmptyState } from "../components/emptyState";
import { EmptyIllustration } from "../components/illustrations";
import { SkeletonCard } from "../components/skeleton";
import { useToast } from "../components/toast";
import { getAuthHeaders, readStoredSession } from "../lib/authSession";

type Filters = {
  query: string;
  format: string;
  genre: string;
  maxFeeUsd: string;
};

const initialFilters: Filters = {
  query: "",
  format: "",
  genre: "",
  maxFeeUsd: ""
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
  closed: "border-ink-500/20 bg-ink-500/10 text-ink-500",
  urgent: "border-red-300 bg-red-50 text-red-700",
  approaching: "border-amber-300 bg-amber-50 text-amber-700",
  comfortable: "border-tide-500/30 bg-tide-500/10 text-tide-700"
};

function competitionInitial(title: string): string {
  return title.charAt(0).toUpperCase();
}

export default function CompetitionsPage() {
  const toast = useToast();
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [results, setResults] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [status, setStatus] = useState("");
  const [signedInUserId, setSignedInUserId] = useState("");
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [reminderTargetUserId, setReminderTargetUserId] = useState("");
  const [reminderMessage, setReminderMessage] = useState("");
  const [sendingReminder, setSendingReminder] = useState(false);

  const upcomingDeadlines = useMemo(() => {
    const now = Date.now();

    return [...results]
      .map((competition) => ({
        competition,
        deadlineAt: new Date(competition.deadline).getTime()
      }))
      .filter((entry) => Number.isFinite(entry.deadlineAt) && entry.deadlineAt >= now)
      .sort((left, right) => left.deadlineAt - right.deadlineAt)
      .slice(0, 8)
      .map((entry) => entry.competition);
  }, [results]);

  async function search(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setLoading(true);
    setStatus("");

    const params = new URLSearchParams();
    if (filters.query.trim()) params.set("query", filters.query.trim());
    if (filters.format.trim()) params.set("format", filters.format.trim());
    if (filters.genre.trim()) params.set("genre", filters.genre.trim());
    if (filters.maxFeeUsd.trim()) params.set("maxFeeUsd", filters.maxFeeUsd.trim());

    try {
      const response = await fetch(`/api/v1/competitions?${params.toString()}`, { cache: "no-store" });
      const body = (await response.json()) as { competitions?: Competition[]; error?: string };
      if (!response.ok) {
        setStatus(body.error ? `Error: ${body.error}` : "Competition search failed.");
        return;
      }

      const competitions = body.competitions ?? [];
      setResults(competitions);
      setHasSearched(true);
      setStatus(`Found ${competitions.length as number} competitions.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Competition search failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const session = readStoredSession();
    if (session) {
      setSignedInUserId(session.user.id);
      setReminderTargetUserId(session.user.id);
    }

    void search();
  }, []);

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
            "content-type": "application/json",
            ...getAuthHeaders()
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

  return (
    <section className="space-y-4">
      <article className="hero-card animate-in">
        <p className="eyebrow">Competition Directory</p>
        <h1 className="text-4xl text-ink-900">A vetted directory, not a random spreadsheet</h1>
        <p className="max-w-3xl text-ink-700">
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
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Title or description"
            />
          </label>

          <div className="grid-three">
            <label className="stack-tight">
              <span>Format</span>
              <input
                className="input"
                value={filters.format}
                onChange={(event) => setFilters((current) => ({ ...current, format: event.target.value }))}
                placeholder="feature / tv / short"
              />
            </label>
            <label className="stack-tight">
              <span>Genre</span>
              <input
                className="input"
                value={filters.genre}
                onChange={(event) => setFilters((current) => ({ ...current, genre: event.target.value }))}
                placeholder="drama / comedy"
              />
            </label>
            <label className="stack-tight">
              <span>Max fee (USD)</span>
              <input
                className="input"
                type="number"
                min={0}
                value={filters.maxFeeUsd}
                onChange={(event) => setFilters((current) => ({ ...current, maxFeeUsd: event.target.value }))}
              />
            </label>
          </div>

          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setFilters(initialFilters);
                setResults([]);
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
            illustration={<EmptyIllustration variant="calendar" className="h-14 w-14 text-ink-900" />}
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
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ember-500/10 text-sm font-bold text-ember-700">
                      {competitionInitial(competition.title)}
                    </span>
                    <h3 className="text-lg text-ink-900">{competition.title}</h3>
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
            illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-ink-900" />}
            title="Start exploring competitions"
            description="Use the search filters above to find screenwriting competitions, fellowships, and labs."
          />
        ) : !loading && results.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-ink-900" />}
            title="No matches found"
            description="Try adjusting your filters or broadening your search terms."
          />
        ) : null}
        {results.map((competition) => {
          const dl = describeDeadline(competition.deadline);
          return (
            <article key={competition.id} className="subcard">
              <div className="flex gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ember-500/10 text-lg font-bold text-ember-700">
                  {competitionInitial(competition.title)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="subcard-header">
                    <strong className="text-lg text-ink-900">{competition.title}</strong>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${urgencyColors[dl.urgency]}`}>
                      {dl.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-700 line-clamp-2">{competition.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="badge">{competition.format}</span>
                    <span className="badge">{competition.genre}</span>
                    {competition.feeUsd === 0 ? (
                      <span className="inline-flex items-center rounded-full border border-tide-500/30 bg-tide-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-tide-700">
                        Free
                      </span>
                    ) : (
                      <span className="badge">${competition.feeUsd}</span>
                    )}
                    <span className="text-xs text-ink-500">
                      Deadline {new Date(competition.deadline).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-3 inline-form">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => openReminderModal(competition)}
                    >
                      Set reminder
                    </button>
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
