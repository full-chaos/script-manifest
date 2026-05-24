import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { WriterResume } from "@script-manifest/contracts";
import { ApiError } from "../../lib/fetcher";
import { serverFetch } from "../../lib/serverFetch";
import { ResumeView } from "./ResumeView";

type PageParams = { params: Promise<{ handle: string }> };

async function loadResume(handle: string): Promise<WriterResume> {
  try {
    const response = await serverFetch<{ resume: WriterResume }>(`/api/v1/writers/${encodeURIComponent(handle)}/resume`);
    return response.resume;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { handle } = await params;
  const resume = await loadResume(handle);
  const title = `${resume.profile.displayName} — Writer Resume`;
  const description = resume.profile.bio || `${resume.profile.displayName}'s verified writing proof, placements, projects, and hosted scripts.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: resume.profile.headshotUrl ? [{ url: resume.profile.headshotUrl }] : undefined
    }
  };
}

export default async function WriterResumePage({ params }: PageParams) {
  const { handle } = await params;
  const resume = await loadResume(handle);
  return (
    <section className="space-y-6">
      <ResumeView writerId={resume.profile.id} />
      <article className="hero-card hero-card--amber animate-in">
        <p className="eyebrow eyebrow--amber">Verified writer resume</p>
        <h1 className="text-4xl text-foreground">{resume.profile.displayName}</h1>
        <p className="max-w-3xl text-foreground-secondary">{resume.profile.bio || "Verified writing proof from Script Manifest."}</p>
        <div className="inline-form">
          <span className="badge">{resume.ranking.tier}</span>
          <span className="badge">Rank #{resume.ranking.rank || "—"}</span>
          <span className="badge">{resume.proofMetrics.verifiedPlacementsCount} verified placements</span>
        </div>
      </article>

      <section className="grid-two">
        <article className="panel stack">
          <p className="eyebrow">Placements</p>
          {resume.placements.length ? resume.placements.map((placement) => (
            <div key={placement.id} className="subcard">
              <div className="inline-form">
                <strong>{placement.status}</strong>
                <span className={placement.verificationState === "verified" ? "badge badge-success" : "badge"}>{placement.badgeLabel ?? "Verified"}</span>
              </div>
              <p className="text-foreground-secondary">Competition: {placement.competitionId}</p>
            </div>
          )) : <p className="text-foreground-secondary">No verified placements yet.</p>}
        </article>

        <article className="panel stack">
          <p className="eyebrow">Proof metrics</p>
          <p>{resume.proofMetrics.totalViews30d} resume views in 30 days</p>
          <p>{resume.proofMetrics.totalScriptDownloads} script downloads</p>
          <p>{resume.projects.length} public projects</p>
        </article>
      </section>

      <article className="panel stack">
        <p className="eyebrow">Projects</p>
        {resume.projects.map((project) => (
          <div key={project.id} className="subcard">
            <strong>{project.title}</strong>
            <p className="text-foreground-secondary">{project.logline}</p>
            <span className="badge">{project.format} · {project.genre}</span>
          </div>
        ))}
      </article>

      <article className="panel stack">
        <p className="eyebrow">Hosted scripts</p>
        {resume.hostedScripts.length ? resume.hostedScripts.map((script) => (
          <a key={script.scriptId} className="subcard no-underline" href={script.viewerPath}>{script.filename}</a>
        )) : <p className="text-foreground-secondary">No public hosted scripts yet.</p>}
      </article>
    </section>
  );
}
