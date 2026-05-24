"use client";

import useSWR from "swr";
import type { ResumeMetricsResponse, WriterProfile } from "@script-manifest/contracts";
import { fetcher } from "../lib/fetcher";

export function ResumeMetricsWidget({ profile }: { profile: WriterProfile }) {
  const { data } = useSWR<{ metrics: ResumeMetricsResponse }>("/api/v1/writers/me/resume-metrics", fetcher);
  const handle = profile.customProfileUrl || profile.id;
  const sharePath = handle.startsWith("http") ? handle : `/writers/${handle}`;

  async function copyShareLink() {
    const origin = window.location.origin;
    await navigator.clipboard.writeText(sharePath.startsWith("http") ? sharePath : `${origin}${sharePath}`);
  }

  return (
    <article className="panel stack">
      <p className="eyebrow">Resume proof metrics</p>
      <div className="grid-two">
        <span>{data?.metrics?.totalViews7d ?? 0} views · 7d</span>
        <span>{data?.metrics?.totalViews30d ?? 0} views · 30d</span>
        <span>{data?.metrics?.totalScriptDownloads ?? 0} script downloads</span>
        <span>{data?.metrics?.verifiedPlacementsCount ?? 0} verified placements</span>
      </div>
      <div className="inline-form">
        <a className="btn btn-secondary no-underline" href={sharePath}>Open resume</a>
        <button className="btn btn-secondary" type="button" onClick={() => void copyShareLink()}>Copy share link</button>
      </div>
    </article>
  );
}
