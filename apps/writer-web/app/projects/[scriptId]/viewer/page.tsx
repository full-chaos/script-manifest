"use client";

import type { ScriptViewResponse } from "@script-manifest/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getAuthHeaders } from "../../../lib/authSession";

type ViewState = {
  loading: boolean;
  viewer: ScriptViewResponse | null;
  error: string | null;
};

const initialState: ViewState = {
  loading: true,
  viewer: null,
  error: null
};

export default function ScriptViewerPage() {
  const params = useParams<{ scriptId: string }>();
  const scriptId = Array.isArray(params.scriptId) ? params.scriptId[0] : params.scriptId;
  const [viewState, setViewState] = useState<ViewState>(initialState);

  useEffect(() => {
    if (!scriptId) {
      setViewState({ loading: false, viewer: null, error: "missing_script_id" });
      return;
    }

    const controller = new AbortController();
    const loadViewer = async () => {
      try {
        setViewState(initialState);
        const response = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}/viewer`, {
          signal: controller.signal,
          headers: getAuthHeaders()
        });
        const body = (await response.json()) as {
          error?: string;
          detail?: string;
        } & Partial<ScriptViewResponse>;

        if (!response.ok) {
          const message = body.error ?? `viewer_request_failed_${response.status}`;
          setViewState({
            loading: false,
            viewer: null,
            error: body.detail ? `${message}: ${body.detail}` : message
          });
          return;
        }

        setViewState({
          loading: false,
          viewer: body as ScriptViewResponse,
          error: null
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setViewState({
          loading: false,
          viewer: null,
          error: error instanceof Error ? error.message : "unexpected_viewer_error"
        });
      }
    };

    void loadViewer();
    return () => controller.abort();
  }, [scriptId]);

  return (
    <section className="card">
      <h2>Script Viewer Scaffold</h2>
      <p>
        Script: <strong>{scriptId ?? "n/a"}</strong>
      </p>
      <p>
        <Link href="/projects">Back to projects</Link>
      </p>

      {viewState.loading ? <p>Loading viewer payload...</p> : null}
      {viewState.error ? <p className="status-error">Viewer unavailable: {viewState.error}</p> : null}

      {!viewState.loading && viewState.viewer ? (
        <>
          <div className="card viewer-meta">
            <p>
              <strong>File:</strong> {viewState.viewer.filename}
            </p>
            <p>
              <strong>Object:</strong> {viewState.viewer.viewerPath}
            </p>
            <p>
              <strong>Access:</strong>{" "}
              {viewState.viewer.access.canView ? "view allowed" : "view denied (request needed)"}
            </p>
            <p>
              <strong>Expires:</strong> {viewState.viewer.expiresAt}
            </p>
          </div>

          {viewState.viewer.access.canView ? (
            <div className="viewer-shell">
              <object
                className="viewer-frame"
                data={viewState.viewer.viewerUrl}
                type={viewState.viewer.contentType}
              >
                <p>
                  PDF embed placeholder.{" "}
                  <a href={viewState.viewer.viewerUrl} target="_blank" rel="noreferrer">
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
