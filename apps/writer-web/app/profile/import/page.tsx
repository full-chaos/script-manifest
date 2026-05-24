"use client";

import { useMemo, useState, type DragEvent } from "react";
import useSWRMutation from "swr/mutation";
import type { ImportCommitResponse, ImportPreviewResponse } from "@script-manifest/contracts";
import { ApiError, fetcher } from "../../lib/fetcher";
import { useAuth } from "../../lib/AuthProvider";
import { useToast } from "../../components/toast";

const statusOptions = ["pending", "quarterfinalist", "semifinalist", "finalist", "winner"];

async function postCsvPreview(url: string, { arg }: { arg: { csv: string; filename: string } }): Promise<ImportPreviewResponse> {
  return fetcher<ImportPreviewResponse>(`${url}?filename=${encodeURIComponent(arg.filename)}`, {
    method: "POST",
    headers: { "content-type": "text/csv" },
    body: arg.csv
  });
}

async function postCommit(url: string, { arg }: { arg: { batchId: string; acceptedRowIndices: number[]; rowOverrides: Array<{ rowIndex: number; status: string }> } }): Promise<ImportCommitResponse> {
  return fetcher<ImportCommitResponse>(`${url}/${encodeURIComponent(arg.batchId)}/commit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(arg)
  });
}

export default function CareerImportPage() {
  const toast = useToast();
  const { user, loading: authLoading } = useAuth();
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filename, setFilename] = useState("career-history.csv");
  const [dragActive, setDragActive] = useState(false);
  const [statusOverrides, setStatusOverrides] = useState<Record<number, string>>({});
  const writerId = user?.id ?? "";

  const { trigger: previewCsv, isMutating: previewing } = useSWRMutation("/api/v1/career-imports", postCsvPreview, {
    onSuccess(data) {
      setPreview(data);
      const accepted = new Set(data.rows.filter((row) => row.status === "ok").map((row) => row.rowIndex));
      setSelected(accepted);
      setStatusOverrides(Object.fromEntries(data.rows.map((row) => [row.rowIndex, row.row.status])));
      toast.success(`Preview ready: ${data.batch.succeeded} valid, ${data.batch.failed} need review.`);
    },
    onError(error: unknown) {
      toast.error(error instanceof ApiError ? error.message : "CSV preview failed.");
    }
  });

  const { trigger: commitRows, isMutating: committing } = useSWRMutation("/api/v1/career-imports", postCommit, {
    onSuccess(data) {
      toast.success(`Imported ${data.committed} recovered placements.`);
      setSelected(new Set());
    },
    onError(error: unknown) {
      toast.error(error instanceof ApiError ? error.message : "Import commit failed.");
    }
  });

  const selectedCount = selected.size;
  const rows = useMemo(() => preview?.rows ?? [], [preview]);
  const hasInvalidSelection = useMemo(
    () => rows.some((row) => selected.has(row.rowIndex) && row.status !== "ok"),
    [rows, selected]
  );

  async function handleFile(file: File) {
    setFilename(file.name);
    const csv = await file.text();
    await previewCsv({ csv, filename: file.name });
  }

  function toggleRow(rowIndex: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files.item(0);
    if (file) void handleFile(file);
  }

  async function commitSelectedRows() {
    if (!preview) return;
    const acceptedRowIndices = Array.from(selected).sort((a, b) => a - b);
    await commitRows({
      batchId: preview.batch.id,
      acceptedRowIndices,
      rowOverrides: acceptedRowIndices.map((rowIndex) => ({ rowIndex, status: statusOverrides[rowIndex] ?? "pending" }))
    });
  }

  if (!writerId && !authLoading) {
    return (
      <section className="space-y-4">
        <article className="empty-state">Sign in first to import recovered career history.</article>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--amber animate-in">
        <p className="eyebrow eyebrow--amber">Recovered Proof</p>
        <h1 className="text-4xl text-foreground">Import your recovered career history</h1>
        <p className="max-w-2xl text-foreground-secondary">
          Bring old Coverfly-style submissions and placements into Script Manifest with a validation preview first.
          Every committed row is tagged as recovered proof for resume badges and future review.
        </p>
        <div className="inline-form">
          <a className="btn btn-secondary no-underline" href="/career-history-template.csv" download>
            Download CSV template
          </a>
          <span className="badge">500 rows max</span>
          {filename ? <span className="badge">{filename}</span> : null}
        </div>
      </article>

      <article className="panel">
        <div className="grid-two items-stretch">
          <label
            className={`subcard flex cursor-pointer flex-col items-center justify-center gap-3 border-dashed p-8 text-center ${dragActive ? "border-amber-500 bg-amber-50" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <span className="eyebrow">Drop CSV here</span>
            <strong className="text-xl text-foreground">Validate before anything is written</strong>
            <span className="muted">CSV stays server-side and creates a preview batch only.</span>
            <input
              className="sr-only"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.item(0);
                if (file) void handleFile(file);
              }}
            />
          </label>

          <div className="subcard stack">
            <p className="eyebrow">Preview summary</p>
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Rows" value={preview?.batch.rowCount ?? 0} />
              <Metric label="Ready" value={preview?.batch.succeeded ?? 0} />
              <Metric label="Needs review" value={preview?.batch.failed ?? 0} />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!preview || selectedCount === 0 || hasInvalidSelection || committing || previewing}
              onClick={() => void commitSelectedRows()}
            >
              {committing ? "Importing..." : `Commit ${selectedCount} selected rows`}
            </button>
            {hasInvalidSelection ? <p className="text-sm text-red-700">Deselect error rows before committing.</p> : null}
          </div>
        </div>
      </article>

      {preview ? (
        <article className="panel overflow-hidden">
          <div className="subcard-header mb-4">
            <div>
              <p className="eyebrow">Validation Preview</p>
              <h2 className="section-title">Choose rows to recover</h2>
            </div>
            <span className="badge">Batch {preview.batch.id}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-foreground-secondary">
                <tr className="border-b border-zinc-200">
                  <th className="p-2">Import</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Project</th>
                  <th className="p-2">Competition</th>
                  <th className="p-2">Year</th>
                  <th className="p-2">Placement</th>
                  <th className="p-2">Issues</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.rowIndex} className="border-b border-zinc-100 align-top">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selected.has(row.rowIndex)}
                        onChange={() => toggleRow(row.rowIndex)}
                        aria-label={`Select row ${row.rowIndex + 1}`}
                      />
                    </td>
                    <td className="p-2">
                      <span className={`badge ${row.status === "ok" ? "" : "bg-red-100 text-red-800"}`}>
                        {row.status === "ok" ? "OK" : "ERROR"}
                      </span>
                    </td>
                    <td className="p-2 font-medium text-foreground">{row.row.project_title || "—"}</td>
                    <td className="p-2">{row.row.competition_name || "—"}</td>
                    <td className="p-2">{row.row.year || "—"}</td>
                    <td className="p-2">
                      <select
                        className="input min-w-36"
                        value={statusOverrides[row.rowIndex] ?? row.row.status}
                        onChange={(event) => setStatusOverrides((current) => ({ ...current, [row.rowIndex]: event.target.value }))}
                        disabled={row.status !== "ok"}
                      >
                        {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </td>
                    <td className="p-2 text-red-700">{row.errors.length ? row.errors.join("; ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-surface p-3">
      <p className="eyebrow">{label}</p>
      <p className="text-3xl text-foreground">{value}</p>
    </div>
  );
}
