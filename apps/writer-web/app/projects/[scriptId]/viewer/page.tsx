"use client";

import type { ScriptViewResponse } from "@script-manifest/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { fetcher, ApiError } from "../../../lib/fetcher";

export default function ScriptViewerPage() {
  const params = useParams<{ scriptId: string }>();
  const scriptId = Array.isArray(params.scriptId) ? params.scriptId[0] : params.scriptId;
  const viewerKey = scriptId ? `/api/v1/scripts/${encodeURIComponent(scriptId)}/view` : null;

  const { data: viewer, error, isLoading } = useSWR<ScriptViewResponse>(
    viewerKey,
    fetcher,
    { shouldRetryOnError: false },
  );

  const loading = scriptId ? isLoading : false;
  const missingId = !scriptId;
  const errorMessage = missingId
    ? "missing_script_id"
    : error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : null;

  return (
    <section className="card">
      <h2>Script Viewer Scaffold</h2>
      <p>
        Script: <strong>{scriptId ?? "n/a"}</strong>
      </p>
      <p>
        <Link href="/projects">Back to projects</Link>
      </p>

      {loading ? <p>Loading viewer payload...</p> : null}
      {errorMessage ? <p className="status-error">Viewer unavailable: {errorMessage}</p> : null}

      {!loading && viewer ? (
        <>
          <div className="card viewer-meta">
            <p>
              <strong>File:</strong> {viewer.filename}
            </p>
            <p>
              <strong>Object:</strong> {viewer.viewerPath}
            </p>
            <p>
              <strong>Access:</strong>{" "}
              {viewer.access.canView ? "view allowed" : "view denied (request needed)"}
            </p>
            <p>
              <strong>Expires:</strong> {viewer.expiresAt}
            </p>
          </div>

          {viewer.access.canView ? (
            <div className="viewer-shell">
              <object
                className="viewer-frame"
                data={viewer.viewerUrl}
                type={viewer.contentType}
              >
                <p>
                  PDF embed placeholder.{" "}
                  <a href={viewer.viewerUrl} target="_blank" rel="noreferrer">
                    Open in new tab
                  </a>
                  .
                </p>
              </object>
            </div>
          ) : (
            <p className="status-error">
              Access is restricted for this user in the scaffold response.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
