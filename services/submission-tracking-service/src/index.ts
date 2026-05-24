import { type FastifyInstance } from "fastify";
import { Counter } from "prom-client";
import { bootstrapService, registerMetrics, registerSentryErrorHandler, setupErrorReporting, validateRequiredEnv, getAuthUserId, isMainModule, createFastifyServer } from "@script-manifest/service-utils";
import { closePool } from "@script-manifest/db";
import {
  CreateHistoricalPlacementRequestSchema,
  CreatePlacementEvidenceItemSchema,
  PlacementFiltersSchema,
  PlacementEvidenceSchema,
  PlacementListItemSchema,
  PlacementCreateRequestSchema,
  PlacementSchema,
  PlacementVerificationUpdateRequestSchema,
  SubmissionCreateInternalSchema,
  SubmissionFiltersSchema,
  SubmissionProjectReassignmentRequestSchema,
  SubmissionSchema,
  type Placement,
  type PlacementListItem,
  type Submission
} from "@script-manifest/contracts";
import type { SubmissionTrackingRepository } from "./repository.js";
import { PgSubmissionTrackingRepository } from "./pgRepository.js";

const submissionsCounter = new Counter({
  name: "submissions_created_total",
  help: "Total number of submissions created",
});

export type SubmissionTrackingOptions = {
  logger?: boolean;
  repository?: SubmissionTrackingRepository;
};

export function buildServer(options: SubmissionTrackingOptions = {}): FastifyInstance {
  const server = createFastifyServer({ logger: options.logger });
  const repository = options.repository ?? new PgSubmissionTrackingRepository();

  const startedAt = Date.now();

  server.addHook("onReady", async () => {
    await repository.init();
  });

  server.addHook("onClose", async () => {
    await closePool();
  });

  server.get("/health", async (_req, reply) => {
    const checks = await repository.healthCheck();
    const ok = Object.values(checks).every(Boolean);
    return reply.status(ok ? 200 : 503).send({
      service: "submission-tracking-service",
      ok,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      checks,
    });
  });

  server.get("/health/live", async () => ({ ok: true }));

  server.get("/health/ready", async () => ({
    service: "submission-tracking-service",
    ok: true,
    uptime: Math.floor((Date.now() - startedAt) / 1000)
  }));

  server.post("/internal/submissions", async (req, reply) => {
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsedBody = SubmissionCreateInternalSchema.safeParse({
      ...(req.body as object),
      writerId: authUserId
    });
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    const submission = SubmissionSchema.parse(await repository.createSubmission({
      writerId: parsedBody.data.writerId,
      projectId: parsedBody.data.projectId,
      competitionId: parsedBody.data.competitionId,
      status: parsedBody.data.status,
    }));

    submissionsCounter.inc();
    return reply.status(201).send({ submission });
  });

  server.patch<{ Params: { submissionId: string } }>("/internal/submissions/:submissionId/project", async (req, reply) => {
    const { submissionId } = req.params;
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const submission = await repository.getSubmission(submissionId);
    if (!submission) {
      return reply.status(404).send({ error: "submission_not_found" });
    }

    if (submission.writerId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsedBody = SubmissionProjectReassignmentRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    const updatedSubmission = await repository.updateSubmissionProject(submissionId, parsedBody.data.projectId);
    if (!updatedSubmission) {
      return reply.status(404).send({ error: "submission_not_found" });
    }

    return reply.send({ submission: SubmissionSchema.parse(updatedSubmission) });
  });

  server.get("/internal/submissions", async (req, reply) => {
    const parsedQuery = SubmissionFiltersSchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({
        error: "invalid_query",
        details: parsedQuery.error.flatten()
      });
    }

    const authUserId = getAuthUserId(req);
    const filters = parsedQuery.data;
    if (authUserId && filters.writerId && filters.writerId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const repositoryFilters = authUserId
      ? { ...filters, writerId: authUserId }
      : filters;
    const filteredSubmissions = (await repository.listSubmissions(repositoryFilters)).map((submission) => SubmissionSchema.parse(submission));

    return reply.send({ submissions: filteredSubmissions });
  });

  server.post<{ Params: { submissionId: string } }>("/internal/submissions/:submissionId/placements", async (req, reply) => {
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const { submissionId } = req.params;
    const submission = await repository.getSubmission(submissionId);
    if (!submission) {
      return reply.status(404).send({ error: "submission_not_found" });
    }

    if (submission.writerId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsedBody = PlacementCreateRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    const placement = PlacementSchema.parse(await repository.createPlacement(submissionId, parsedBody.data.status));
    const updatedSubmission = await repository.updateSubmissionStatus(submissionId, placement.status);
    if (!updatedSubmission) {
      return reply.status(404).send({ error: "submission_not_found" });
    }

    return reply.status(201).send({ placement, submission: SubmissionSchema.parse(updatedSubmission) });
  });

  server.post("/internal/placements/historical", async (req, reply) => {
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsedBody = CreateHistoricalPlacementRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    const created = await repository.createHistoricalPlacement({
      ...parsedBody.data,
      recordedByUserId: authUserId
    });
    const evidence = await repository.listPlacementEvidence(created.placement.id);

    submissionsCounter.inc();
    return reply.status(201).send({
      submission: SubmissionSchema.parse(created.submission),
      placement: toPlacementDetail(PlacementSchema.parse(created.placement)),
      evidence: evidence.map((item) => PlacementEvidenceSchema.parse(item))
    });
  });

  server.post<{ Params: { placementId: string } }>("/internal/placements/:placementId/evidence", async (req, reply) => {
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const placement = await repository.getPlacement(req.params.placementId);
    if (!placement) {
      return reply.status(404).send({ error: "placement_not_found" });
    }

    const submission = await repository.getSubmission(placement.submissionId);
    if (!submission) {
      return reply.status(404).send({ error: "submission_not_found" });
    }

    if (submission.writerId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsedBody = CreatePlacementEvidenceItemSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsedBody.error.flatten() });
    }

    const evidence = await repository.createPlacementEvidence({
      ...parsedBody.data,
      placementId: req.params.placementId,
      uploadedByUserId: authUserId
    });
    return reply.status(201).send({ evidence: PlacementEvidenceSchema.parse(evidence) });
  });

  server.get<{ Params: { placementId: string } }>("/internal/placements/:placementId/evidence", async (req, reply) => {
    const placement = await repository.getPlacement(req.params.placementId);
    if (!placement) {
      return reply.status(404).send({ error: "placement_not_found" });
    }

    const submission = await repository.getSubmission(placement.submissionId);
    if (!submission) {
      return reply.status(404).send({ error: "submission_not_found" });
    }

    const authUserId = getAuthUserId(req);
    if (authUserId && authUserId !== submission.writerId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const evidence = await repository.listPlacementEvidence(req.params.placementId);
    return reply.send({ evidence: evidence.map((item) => PlacementEvidenceSchema.parse(item)) });
  });

  server.get<{ Params: { submissionId: string } }>("/internal/submissions/:submissionId/placements", async (req, reply) => {
    const { submissionId } = req.params;
    const submission = await repository.getSubmission(submissionId);
    if (!submission) {
      return reply.status(404).send({ error: "submission_not_found" });
    }

    const authUserId = getAuthUserId(req);
    if (authUserId && authUserId !== submission.writerId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const items = (await repository.listPlacementsBySubmission(submissionId))
      .map((placement) => toPlacementListItem(PlacementSchema.parse(placement), SubmissionSchema.parse(submission)));

    return reply.send({ placements: items });
  });

  server.get("/internal/placements", async (req, reply) => {
    const parsedQuery = PlacementFiltersSchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({
        error: "invalid_query",
        details: parsedQuery.error.flatten()
      });
    }

    const authUserId = getAuthUserId(req);
    const filters = parsedQuery.data;
    if (authUserId && filters.writerId && filters.writerId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const repositoryFilters = authUserId
      ? { ...filters, writerId: authUserId }
      : filters;
    const filteredPlacements = (await repository.listPlacements(repositoryFilters)).map(({ placement, submission }) =>
      toPlacementListItem(PlacementSchema.parse(placement), SubmissionSchema.parse(submission)),
    );

    return reply.send({ placements: filteredPlacements });
  });

  server.get<{ Params: { placementId: string } }>("/internal/placements/:placementId", async (req, reply) => {
    const { placementId } = req.params;
    const placement = await repository.getPlacement(placementId);
    if (!placement) {
      return reply.status(404).send({ error: "placement_not_found" });
    }

    const submission = await repository.getSubmission(placement.submissionId);
    if (!submission) {
      return reply.status(404).send({ error: "submission_not_found" });
    }

    const authUserId = getAuthUserId(req);
    if (authUserId && authUserId !== submission.writerId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    return reply.send({ placement: toPlacementListItem(PlacementSchema.parse(placement), SubmissionSchema.parse(submission)) });
  });

  server.post<{ Params: { placementId: string } }>("/internal/placements/:placementId/verify", async (req, reply) => {
    const { placementId } = req.params;
    const placement = await repository.getPlacement(placementId);
    if (!placement) {
      return reply.status(404).send({ error: "placement_not_found" });
    }

    const parsedBody = PlacementVerificationUpdateRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    const updatedPlacement = await repository.updatePlacementVerification(placementId, parsedBody.data);
    if (!updatedPlacement) {
      return reply.status(404).send({ error: "placement_not_found" });
    }

    return reply.send({ placement: toPlacementDetail(PlacementSchema.parse(updatedPlacement)) });
  });

  return server;
}

function toPlacementListItem(placement: Placement, submission: Submission): PlacementListItem {
  return PlacementListItemSchema.parse({
    ...placement,
    writerId: submission.writerId,
    projectId: submission.projectId,
    competitionId: submission.competitionId,
    badgeLabel: placementBadgeLabel(placement)
  });
}

function toPlacementDetail(placement: Placement): Placement & { badgeLabel: string } {
  return { ...placement, badgeLabel: placementBadgeLabel(placement) };
}

function placementBadgeLabel(placement: Placement): string {
  if (placement.verificationState === "verified") return "Verified";
  if (placement.verificationState === "rejected") return "Rejected";
  if (placement.isHistorical) return "Unverified — Historical";
  return "Unverified";
}

export async function startServer(): Promise<void> {
  const boot = bootstrapService("submission-tracking-service");
  setupErrorReporting("submission-tracking-service");
  
  validateRequiredEnv(["PORT", "DATABASE_URL"]);
  boot.phase("env validated");
  const port = Number(process.env.PORT ?? 4004);
  const server = buildServer();
  boot.phase("server built");
  
  // Register Prometheus metrics endpoint (only in production server startup, not tests).
  await registerMetrics(server);
  registerSentryErrorHandler(server);
  await server.listen({ port, host: "0.0.0.0" });
  boot.ready(port);
}

if (isMainModule(import.meta.url)) {
  startServer().catch((error) => { process.stderr.write(String(error) + "\n"); process.exit(1); });
}
