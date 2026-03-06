"use client";

import { useState, type FormEvent } from "react";
import { Bug, X, ChevronDown } from "lucide-react";
import { useToast } from "./toast";

type Priority = { value: number; label: string };

const priorities: Priority[] = [
  { value: 1, label: "Urgent" },
  { value: 2, label: "High" },
  { value: 3, label: "Normal" },
  { value: 4, label: "Low" }
];

type SubmitState = "idle" | "submitting" | "success";

export function BugReportWidget() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(3);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const toast = useToast();

  function resetForm() {
    setTitle("");
    setDescription("");
    setPriority(3);
    setSubmitState("idle");
  }

  function handleClose() {
    setOpen(false);
    if (submitState === "success") {
      resetForm();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState("submitting");

    try {
      const response = await fetch("/api/v1/bug-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          priority,
          pageUrl: window.location.href,
          userAgent: navigator.userAgent
        })
      });

      const body = await response.json();

      if (!response.ok) {
        const detail = typeof body.detail === "string" ? body.detail : "Unable to submit bug report.";
        toast.error(detail);
        setSubmitState("idle");
        return;
      }

      setSubmitState("success");
      toast.success(
        body.issueId ? `Bug reported as ${body.issueId}` : "Bug report submitted."
      );
      resetForm();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Network error.");
      setSubmitState("idle");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-ember-700 bg-gradient-to-br from-ember-500 to-ember-700 text-white shadow-panel transition hover:-translate-y-0.5 hover:shadow-lg"
        aria-label={open ? "Close bug report" : "Report a bug"}
        aria-expanded={open}
        aria-controls="bug-report-panel"
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Bug className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <div
          id="bug-report-panel"
          role="dialog"
          aria-modal="false"
          aria-label="Report a bug"
          className="fixed bottom-20 right-5 z-50 w-[340px] rounded-2xl border border-border/55 bg-surface/95 p-5 shadow-panel backdrop-blur animate-in"
        >
          <div className="mb-4 space-y-1">
            <h2 className="font-display text-xl text-foreground">Report a Bug</h2>
            <p className="text-xs text-muted">
              Describe what went wrong and we&apos;ll look into it.
            </p>
          </div>

          <form className="stack" onSubmit={handleSubmit}>
            <label className="stack-tight">
              <span className="text-sm font-medium text-foreground-secondary">Title</span>
              <input
                className="input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Brief summary of the issue"
                required
                maxLength={200}
              />
            </label>

            <label className="stack-tight">
              <span className="text-sm font-medium text-foreground-secondary">Description</span>
              <textarea
                className="input textarea min-h-[80px]"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Steps to reproduce, expected vs actual behavior..."
                required
                maxLength={2000}
              />
            </label>

            <label className="stack-tight">
              <span className="text-sm font-medium text-foreground-secondary">Priority</span>
              <div className="relative">
                <select
                  className="input appearance-none pr-8"
                  value={priority}
                  onChange={(event) => setPriority(Number(event.target.value))}
                >
                  {priorities.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
              </div>
            </label>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                className="btn btn-primary flex-1 justify-center"
                disabled={submitState === "submitting"}
              >
                {submitState === "submitting" ? "Submitting..." : "Submit Bug Report"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClose}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
