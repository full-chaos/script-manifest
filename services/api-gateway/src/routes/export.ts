import type { FastifyInstance } from "fastify";
import archiver from "archiver";
import {
  type GatewayContext,
  getUserIdFromAuth,
  safeJsonParse
} from "../helpers.js";

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }
  const str = typeof value === "string" ? value : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

function csvRow(values: unknown[]): string {
  return values.map(escapeCsvValue).join(",");
}

function buildProfileCsv(profile: Record<string, unknown> | null): string {
  const header = "display_name,email,bio,genres,representation_status";
  if (!profile) {
    return `# Profile\n${header}\n`;
  }
  const genres = Array.isArray(profile.genres)
    ? (profile.genres as string[]).join(",")
    : String(profile.genres ?? "");
  const row = csvRow([
    profile.displayName ?? "",
    profile.email ?? "",
    profile.bio ?? "",
    genres,
    profile.representationStatus ?? ""
  ]);
  return `# Profile\n${header}\n${row}\n`;
}

function buildProjectsCsv(projects: Record<string, unknown>[]): string {
  const header = "id,title,format,genre,page_count,logline,created_at,updated_at";
  const rows = projects.map((p) =>
    csvRow([p.id, p.title, p.format, p.genre, p.pageCount, p.logline, p.createdAt, p.updatedAt])
  );
  return `# Projects\n${header}\n${rows.join("\n")}\n`;
}

function buildSubmissionsCsv(submissions: Record<string, unknown>[]): string {
  const header = "id,project_id,competition_id,status,created_at,updated_at";
  const rows = submissions.map((s) =>
    csvRow([s.id, s.projectId, s.competitionId, s.status, s.createdAt, s.updatedAt])
  );
  return `# Submissions\n${header}\n${rows.join("\n")}\n`;
}

function buildPlacementsCsv(placements: Record<string, unknown>[]): string {
  const header = "id,submission_id,status,verification_state,created_at,updated_at";
  const rows = placements.map((p) =>
    csvRow([p.id, p.submissionId, p.status, p.verificationState, p.createdAt, p.updatedAt])
  );
  return `# Placements\n${header}\n${rows.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Downstream data fetching
// ---------------------------------------------------------------------------

type ExportData = {
  profile: Record<string, unknown> | null;
  projects: Record<string, unknown>[];
  submissions: Record<string, unknown>[];
  placements: Record<string, unknown>[];
};

async function fetchExportData(ctx: GatewayContext, userId: string): Promise<ExportData> {
  const [profileRes, projectsRes, submissionsRes, placementsRes] = await Promise.all([
    ctx.requestFn(`${ctx.profileServiceBase}/internal/profiles/${encodeURIComponent(userId)}`, {
      method: "GET"
    }),
    ctx.requestFn(`${ctx.profileServiceBase}/internal/projects?ownerUserId=${encodeURIComponent(userId)}`, {
      method: "GET"
    }),
    ctx.requestFn(`${ctx.submissionTrackingBase}/internal/submissions?writerId=${encodeURIComponent(userId)}`, {
      method: "GET"
    }),
    ctx.requestFn(`${ctx.submissionTrackingBase}/internal/placements`, {
      method: "GET"
    })
  ]);

  const profileBody = safeJsonParse(await profileRes.body.text()) as Record<string, unknown>;
  const projectsBody = safeJsonParse(await projectsRes.body.text()) as Record<string, unknown>;
  const submissionsBody = safeJsonParse(await submissionsRes.body.text()) as Record<string, unknown>;
  const placementsBody = safeJsonParse(await placementsRes.body.text()) as Record<string, unknown>;

  const profile = (profileBody.profile as Record<string, unknown> | undefined) ?? null;
  const projects = (projectsBody.projects as Record<string, unknown>[] | undefined) ?? [];
  const submissions = (submissionsBody.submissions as Record<string, unknown>[] | undefined) ?? [];
  const placements = (placementsBody.placements as Record<string, unknown>[] | undefined) ?? [];

  return { profile, projects, submissions, placements };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerExportRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.get("/api/v1/export/csv", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const userId = await getUserIdFromAuth(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers.authorization
      );
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const data = await fetchExportData(ctx, userId);

      const csv = [
        buildProfileCsv(data.profile),
        buildProjectsCsv(data.projects),
        buildSubmissionsCsv(data.submissions),
        buildPlacementsCsv(data.placements)
      ].join("\n");

      return reply
        .header("Content-Type", "text/csv")
        .header("Content-Disposition", 'attachment; filename="script-manifest-export.csv"')
        .send(csv);
    }
  });

  server.get("/api/v1/export/zip", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const userId = await getUserIdFromAuth(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers.authorization
      );
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const data = await fetchExportData(ctx, userId);

      const archive = archiver("zip", { zlib: { level: 9 } });

      reply.raw.setHeader("Content-Type", "application/zip");
      reply.raw.setHeader("Content-Disposition", 'attachment; filename="script-manifest-export.zip"');

      archive.pipe(reply.raw);

      archive.append(buildProfileCsv(data.profile), { name: "profile.csv" });
      archive.append(buildProjectsCsv(data.projects), { name: "projects.csv" });
      archive.append(buildSubmissionsCsv(data.submissions), { name: "submissions.csv" });
      archive.append(buildPlacementsCsv(data.placements), { name: "placements.csv" });

      await archive.finalize();

      return reply;
    }
  });
}
