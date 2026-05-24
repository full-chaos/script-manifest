import type { FastifyInstance } from "fastify";
import archiver from "archiver";
import { randomUUID } from "node:crypto";
import { getPool } from "@script-manifest/db";
import {
  type ExportEventRecorder,
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

const defaultExportEventRecorder: ExportEventRecorder = async (event) => {
  const pool = getPool();
  await pool.query(
    `INSERT INTO writer_export_events (id, writer_id, format, status, request_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [`export_${randomUUID().replaceAll("-", "")}`, event.writerId, event.format, event.status, event.requestId ?? null]
  );
};

async function recordExportEvent(ctx: GatewayContext, event: Parameters<ExportEventRecorder>[0]): Promise<void> {
  const recorder = ctx.exportEventRecorder ?? defaultExportEventRecorder;
  try {
    await recorder(event);
  } catch (error) {
    // Export delivery must not fail solely because trust metrics instrumentation is unavailable.
    // The metrics-service admin page surfaces zero/missing export events as a warning.
    void error;
  }
}

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
    ctx.requestFn(`${ctx.submissionTrackingBase}/internal/placements?writerId=${encodeURIComponent(userId)}`, {
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
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      let data: ExportData;
      try {
        data = await fetchExportData(ctx, userId);
      } catch {
        await recordExportEvent(ctx, { writerId: userId, format: "csv", status: "failed", requestId: req.id });
        return reply.status(502).send({ error: "export_unavailable" });
      }

      const csv = [
        buildProfileCsv(data.profile),
        buildProjectsCsv(data.projects),
        buildSubmissionsCsv(data.submissions),
        buildPlacementsCsv(data.placements)
      ].join("\n");

      await recordExportEvent(ctx, { writerId: userId, format: "csv", status: "generated", requestId: req.id });

      return reply
        .header("Content-Type", "text/csv")
        .header("Content-Disposition", 'attachment; filename="script-manifest-export.csv"')
        .send(csv);
    }
  });

  server.get("/api/v1/export/zip", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      let data: ExportData;
      try {
        data = await fetchExportData(ctx, userId);
      } catch {
        await recordExportEvent(ctx, { writerId: userId, format: "zip", status: "failed", requestId: req.id });
        return reply.status(502).send({ error: "export_unavailable" });
      }

      const archive = archiver("zip", { zlib: { level: 9 } });

      reply.raw.setHeader("Content-Type", "application/zip");
      reply.raw.setHeader("Content-Disposition", 'attachment; filename="script-manifest-export.zip"');

      archive.pipe(reply.raw);

      archive.append(buildProfileCsv(data.profile), { name: "profile.csv" });
      archive.append(buildProjectsCsv(data.projects), { name: "projects.csv" });
      archive.append(buildSubmissionsCsv(data.submissions), { name: "submissions.csv" });
      archive.append(buildPlacementsCsv(data.placements), { name: "placements.csv" });

      await archive.finalize();

      await recordExportEvent(ctx, { writerId: userId, format: "zip", status: "generated", requestId: req.id });

      return reply;
    }
  });
}
