import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { request } from "undici";
import {
  IndustryAccountCreateRequestSchema,
  IndustryAccountVerificationRequestSchema,
  IndustryEntitlementCheckResponseSchema,
  IndustryEntitlementUpsertRequestSchema,
  IndustryListShareTeamRequestSchema,
  IndustryListCreateRequestSchema,
  IndustryListItemCreateRequestSchema,
  IndustryMandateCreateRequestSchema,
  IndustryMandateFiltersSchema,
  IndustryMandateSubmissionCreateRequestSchema,
  IndustryMandateSubmissionReviewRequestSchema,
  IndustryNoteCreateRequestSchema,
  IndustryTeamCreateRequestSchema,
  IndustryTeamMemberUpsertRequestSchema,
  IndustryTalentSearchFiltersSchema,
  IndustryTalentSearchResponseSchema,
  IndustryWeeklyDigestRunRequestSchema,
  NotificationEventEnvelopeSchema
} from "@script-manifest/contracts";
import {
  type IndustryPortalRepository,
  PgIndustryPortalRepository
} from "./repository.js";

type RequestFn = typeof request;

export type IndustryPortalServiceOptions = {
  logger?: boolean;
  repository?: IndustryPortalRepository;
  requestFn?: typeof request;
  scriptStorageBase?: string;
  notificationServiceBase?: string;
};

function readHeader(headers: Record<string, unknown>, name: string): string | null {
  const value = headers[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function resolveVerifiedIndustryAccess(
  repository: IndustryPortalRepository,
  authUserId: string
): Promise<{ industryAccountId: string; role: "owner" | "editor" | "viewer" } | null> {
  return repository.resolveVerifiedAccess(authUserId);
}

function parseLimitOffset(query: unknown): { limit: number; offset: number } {
  const parsed = query as { limit?: string | number; offset?: string | number };
  const rawLimit = typeof parsed.limit === "number"
    ? parsed.limit
    : typeof parsed.limit === "string"
      ? Number(parsed.limit)
      : 20;
  const rawOffset = typeof parsed.offset === "number"
    ? parsed.offset
    : typeof parsed.offset === "string"
      ? Number(parsed.offset)
      : 0;
  return {
    limit: Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.floor(rawLimit))) : 20,
    offset: Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0
  };
}

async function publishScriptDownloadedNotification(
  requestFn: RequestFn,
  notificationServiceBase: string,
  actorUserId: string,
  writerUserId: string,
  scriptId: string
): Promise<void> {
  const event = NotificationEventEnvelopeSchema.parse({
    eventId: `industry_download_${randomUUID()}`,
    eventType: "script_downloaded",
    occurredAt: new Date().toISOString(),
    actorUserId,
    targetUserId: writerUserId,
    resourceType: "script",
    resourceId: scriptId,
    payload: {
      channel: "industry_portal",
      scriptId
    }
  });
  const response = await requestFn(`${notificationServiceBase}/internal/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event)
  });
  if (response.statusCode >= 400) {
    const body = await response.body.text();
    throw new Error(`notification_publish_failed:${response.statusCode}:${body}`);
  }
}

export function buildServer(options: IndustryPortalServiceOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger === false ? false : {
      level: process.env.LOG_LEVEL ?? "info"
    },
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    requestIdHeader: "x-request-id"
  });
  const repository = options.repository ?? new PgIndustryPortalRepository();
  const repositoryReady = repository.init();
  const requestFn = options.requestFn ?? request;
  const scriptStorageBase = options.scriptStorageBase ?? process.env.SCRIPT_STORAGE_SERVICE_URL ?? "http://localhost:4011";
  const notificationServiceBase = options.notificationServiceBase ?? process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4010";

  server.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    allowList: []
  });

  server.get("/health", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    handler: async (_req, reply) => {
      await repositoryReady;
      const checks: Record<string, boolean> = {};
      try {
        const result = await repository.healthCheck();
        checks.database = result.database;
      } catch {
        checks.database = false;
      }
      const ok = Object.values(checks).every(Boolean);
      return reply.status(ok ? 200 : 503).send({ service: "industry-portal-service", ok, checks });
    }
  });

  server.get("/health/live", async () => ({ ok: true }));

  server.get("/health/ready", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    handler: async (_req, reply) => {
      await repositoryReady;
      const checks: Record<string, boolean> = {};
      try {
        const result = await repository.healthCheck();
        checks.database = result.database;
      } catch {
        checks.database = false;
      }
      const ok = Object.values(checks).every(Boolean);
      return reply.status(ok ? 200 : 503).send({ service: "industry-portal-service", ok, checks });
    }
  });

  server.post("/internal/accounts", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const authUserId = readHeader(req.headers, "x-auth-user-id");
      if (!authUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      const parsed = IndustryAccountCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      const result = await repository.createAccount({
        ...parsed.data,
        userId: authUserId
      });

      if (result.status === "user_not_found") {
        return reply.status(404).send({ error: "user_not_found" });
      }
      if (result.status === "already_exists") {
        return reply.status(409).send({ error: "industry_account_exists", account: result.account });
      }

      return reply.status(201).send({ account: result.account });
    }
  });

  server.get("/internal/accounts/:accountId", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const { accountId } = req.params as { accountId: string };
      const account = await repository.getAccountById(accountId);
      if (!account) {
        return reply.status(404).send({ error: "industry_account_not_found" });
      }
      return reply.send({ account });
    }
  });

  server.post("/internal/accounts/:accountId/verify", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const { accountId } = req.params as { accountId: string };
      const reviewerUserId = readHeader(req.headers, "x-admin-user-id");
      if (!reviewerUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      const parsed = IndustryAccountVerificationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      const account = await repository.verifyAccount(accountId, reviewerUserId, parsed.data);
      if (!account) {
        return reply.status(404).send({ error: "industry_account_not_found" });
      }

      return reply.send({ account });
    }
  });

  server.put("/internal/entitlements/:writerUserId", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const { writerUserId } = req.params as { writerUserId: string };
      const authUserId = readHeader(req.headers, "x-auth-user-id");
      if (!authUserId || authUserId !== writerUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      const parsed = IndustryEntitlementUpsertRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      const entitlement = await repository.upsertEntitlement(writerUserId, authUserId, parsed.data);
      if (!entitlement) {
        return reply.status(404).send({ error: "entitlement_target_not_found" });
      }

      return reply.send({ entitlement });
    }
  });

  server.get("/internal/entitlements/:writerUserId/check", {
    config: { rateLimit: { max: 40, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const { writerUserId } = req.params as { writerUserId: string };
      const query = req.query as { industryAccountId?: string; industryUserId?: string };

      let industryAccountId = typeof query.industryAccountId === "string"
        ? query.industryAccountId
        : "";
      if (!industryAccountId && typeof query.industryUserId === "string" && query.industryUserId.length > 0) {
        const account = await repository.getAccountByUserId(query.industryUserId);
        industryAccountId = account?.id ?? "";
      }
      if (!industryAccountId) {
        return reply.status(400).send({ error: "invalid_query", detail: "industryAccountId or industryUserId is required" });
      }

      const entitlement = await repository.getEntitlement(writerUserId, industryAccountId);
      const accessLevel = entitlement?.accessLevel ?? "none";
      const response = IndustryEntitlementCheckResponseSchema.parse({
        writerUserId,
        industryAccountId,
        accessLevel,
        canView: accessLevel === "view" || accessLevel === "download",
        canDownload: accessLevel === "download"
      });
      return reply.send(response);
    }
  });

  server.get("/internal/talent-search", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const authUserId = readHeader(req.headers, "x-auth-user-id");
      if (!authUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      const access = await resolveVerifiedIndustryAccess(repository, authUserId);
      if (!access) {
        return reply.status(403).send({ error: "industry_account_not_verified" });
      }

      const parsed = IndustryTalentSearchFiltersSchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_query", details: parsed.error.flatten() });
      }

      const page = await repository.searchTalent(parsed.data);
      const response = IndustryTalentSearchResponseSchema.parse(page);
      return reply.send(response);
    }
  });

  server.post("/internal/talent-index/rebuild", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const result = await repository.rebuildTalentIndex();
      return reply.send(result);
    }
  });

  server.get("/internal/lists", {
    config: { rateLimit: { max: 40, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const authUserId = readHeader(req.headers, "x-auth-user-id");
      if (!authUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const access = await resolveVerifiedIndustryAccess(repository, authUserId);
      if (!access) {
        return reply.status(403).send({ error: "industry_account_not_verified" });
      }

      const lists = await repository.listLists(access.industryAccountId, authUserId);
      return reply.send({ lists });
    }
  });

  server.post("/internal/lists", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const authUserId = readHeader(req.headers, "x-auth-user-id");
      if (!authUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const access = await resolveVerifiedIndustryAccess(repository, authUserId);
      if (!access) {
        return reply.status(403).send({ error: "industry_account_not_verified" });
      }

      const parsed = IndustryListCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      const list = await repository.createList(access.industryAccountId, authUserId, parsed.data);
      if (!list) {
        return reply.status(404).send({ error: "industry_account_not_found" });
      }
      return reply.status(201).send({ list });
    }
  });

  server.post("/internal/lists/:listId/items", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const authUserId = readHeader(req.headers, "x-auth-user-id");
      if (!authUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const access = await resolveVerifiedIndustryAccess(repository, authUserId);
      if (!access) {
        return reply.status(403).send({ error: "industry_account_not_verified" });
      }
      const parsed = IndustryListItemCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const { listId } = req.params as { listId: string };
      const item = await repository.addListItem(listId, access.industryAccountId, authUserId, parsed.data);
      if (!item) {
        return reply.status(404).send({ error: "list_or_writer_not_found" });
      }
      return reply.status(201).send({ item });
    }
  });

  server.post("/internal/lists/:listId/notes", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const authUserId = readHeader(req.headers, "x-auth-user-id");
      if (!authUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const access = await resolveVerifiedIndustryAccess(repository, authUserId);
      if (!access) {
        return reply.status(403).send({ error: "industry_account_not_verified" });
      }
      const parsed = IndustryNoteCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const { listId } = req.params as { listId: string };
      const note = await repository.addListNote(listId, access.industryAccountId, authUserId, parsed.data);
      if (!note) {
        return reply.status(404).send({ error: "list_or_target_not_found" });
      }
      return reply.status(201).send({ note });
    }
  });

  server.post("/internal/lists/:listId/share-team", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const authUserId = readHeader(req.headers, "x-auth-user-id");
      if (!authUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const access = await resolveVerifiedIndustryAccess(repository, authUserId);
      if (!access) {
        return reply.status(403).send({ error: "industry_account_not_verified" });
      }
      const parsed = IndustryListShareTeamRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const { listId } = req.params as { listId: string };
      const ok = await repository.shareListWithTeam(
        listId,
        access.industryAccountId,
        authUserId,
        parsed.data
      );
      if (!ok) {
        return reply.status(404).send({ error: "list_or_team_not_found_or_forbidden" });
      }
      return reply.send({ shared: true });
    }
  });

  server.get("/internal/teams", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const authUserId = readHeader(req.headers, "x-auth-user-id");
      if (!authUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const access = await resolveVerifiedIndustryAccess(repository, authUserId);
      if (!access) {
        return reply.status(403).send({ error: "industry_account_not_verified" });
      }
      const teams = await repository.listTeams(access.industryAccountId);
      return reply.send({ teams });
    }
  });

  server.post("/internal/teams", {
    config: { rateLimit: { max: 15, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const authUserId = readHeader(req.headers, "x-auth-user-id");
      if (!authUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const access = await resolveVerifiedIndustryAccess(repository, authUserId);
      if (!access) {
        return reply.status(403).send({ error: "industry_account_not_verified" });
      }
      const parsed = IndustryTeamCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const team = await repository.createTeam(access.industryAccountId, authUserId, parsed.data);
      if (!team) {
        return reply.status(403).send({ error: "team_create_forbidden" });
      }
      return reply.status(201).send({ team });
    }
  });

  server.put("/internal/teams/:teamId/members", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const authUserId = readHeader(req.headers, "x-auth-user-id");
      if (!authUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const access = await resolveVerifiedIndustryAccess(repository, authUserId);
      if (!access) {
        return reply.status(403).send({ error: "industry_account_not_verified" });
      }
      const parsed = IndustryTeamMemberUpsertRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const { teamId } = req.params as { teamId: string };
      const member = await repository.upsertTeamMember(
        teamId,
        access.industryAccountId,
        authUserId,
        parsed.data
      );
      if (!member) {
        return reply.status(404).send({ error: "team_or_user_not_found_or_forbidden" });
      }
      return reply.send({ member });
    }
  });

  server.get("/internal/activity", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const authUserId = readHeader(req.headers, "x-auth-user-id");
      if (!authUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const access = await resolveVerifiedIndustryAccess(repository, authUserId);
      if (!access) {
        return reply.status(403).send({ error: "industry_account_not_verified" });
      }
      const { limit, offset } = parseLimitOffset(req.query);
      const page = await repository.listActivity(access.industryAccountId, limit, offset);
      return reply.send(page);
    }
  });

  server.get("/internal/mandates", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const parsed = IndustryMandateFiltersSchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_query", details: parsed.error.flatten() });
      }
      const page = await repository.listMandates(parsed.data);
      return reply.send(page);
    }
  });

  server.post("/internal/mandates", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = IndustryMandateCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const mandate = await repository.createMandate(adminUserId, parsed.data);
      if (!mandate) {
        return reply.status(404).send({ error: "admin_user_not_found" });
      }
      return reply.status(201).send({ mandate });
    }
  });

  server.get("/internal/mandates/:mandateId/submissions", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { mandateId } = req.params as { mandateId: string };
      const submissions = await repository.listMandateSubmissions(mandateId);
      return reply.send({ submissions });
    }
  });

  server.post("/internal/mandates/:mandateId/submissions", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const writerUserId = readHeader(req.headers, "x-auth-user-id");
      if (!writerUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { mandateId } = req.params as { mandateId: string };
      const parsed = IndustryMandateSubmissionCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const submission = await repository.createMandateSubmission(mandateId, writerUserId, parsed.data);
      if (!submission) {
        return reply.status(404).send({ error: "mandate_or_project_not_found" });
      }
      return reply.status(201).send({ submission });
    }
  });

  server.post("/internal/mandates/:mandateId/submissions/:submissionId/review", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const reviewerUserId = readHeader(req.headers, "x-admin-user-id");
      if (!reviewerUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { mandateId, submissionId } = req.params as { mandateId: string; submissionId: string };
      const parsed = IndustryMandateSubmissionReviewRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const submission = await repository.reviewMandateSubmission(
        mandateId,
        submissionId,
        reviewerUserId,
        parsed.data
      );
      if (!submission) {
        return reply.status(404).send({ error: "submission_not_found_or_not_reviewable" });
      }
      return reply.send({ submission });
    }
  });

  server.post("/internal/digests/weekly/run", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const authUserId = readHeader(req.headers, "x-auth-user-id");
      if (!authUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const access = await resolveVerifiedIndustryAccess(repository, authUserId);
      if (!access) {
        return reply.status(403).send({ error: "industry_account_not_verified" });
      }
      const parsed = IndustryWeeklyDigestRunRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const run = await repository.createWeeklyDigestRun(access.industryAccountId, authUserId, parsed.data);
      if (!run) {
        return reply.status(404).send({ error: "digest_run_failed" });
      }
      return reply.status(201).send({ run });
    }
  });

  server.get("/internal/digests/weekly/runs", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const authUserId = readHeader(req.headers, "x-auth-user-id");
      if (!authUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const access = await resolveVerifiedIndustryAccess(repository, authUserId);
      if (!access) {
        return reply.status(403).send({ error: "industry_account_not_verified" });
      }
      const { limit, offset } = parseLimitOffset(req.query);
      const page = await repository.listWeeklyDigestRuns(access.industryAccountId, limit, offset);
      return reply.send(page);
    }
  });

  server.get("/internal/analytics", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const authUserId = readHeader(req.headers, "x-auth-user-id");
      if (!authUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const access = await resolveVerifiedIndustryAccess(repository, authUserId);
      if (!access) {
        return reply.status(403).send({ error: "industry_account_not_verified" });
      }
      const windowDays = Number((req.query as { windowDays?: string }).windowDays ?? "30");
      const summary = await repository.getAnalyticsSummary(access.industryAccountId, windowDays);
      return reply.send({ summary });
    }
  });

  server.post("/internal/scripts/:scriptId/download", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const authUserId = readHeader(req.headers, "x-auth-user-id");
      if (!authUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const access = await resolveVerifiedIndustryAccess(repository, authUserId);
      if (!access) {
        return reply.status(403).send({ error: "industry_account_not_verified" });
      }
      const { scriptId } = req.params as { scriptId: string };
      const writerUserId = await repository.resolveScriptOwnerUserId(scriptId);
      if (!writerUserId) {
        return reply.status(404).send({ error: "script_not_found" });
      }

      const entitlement = await repository.getEntitlement(writerUserId, access.industryAccountId);
      const accessLevel = entitlement?.accessLevel ?? "none";
      if (accessLevel !== "download") {
        return reply.status(403).send({ error: "download_not_allowed" });
      }

      const upstream = await requestFn(
        `${scriptStorageBase}/internal/scripts/${encodeURIComponent(scriptId)}/view?viewerUserId=${encodeURIComponent(authUserId)}`,
        { method: "GET" }
      );
      const upstreamBody = await upstream.body.text();
      let body: Record<string, unknown> = {};
      if (upstreamBody.length > 0) {
        try {
          body = JSON.parse(upstreamBody) as Record<string, unknown>;
        } catch {
          body = { raw: upstreamBody };
        }
      }
      if (upstream.statusCode >= 400) {
        return reply.status(upstream.statusCode).send(body);
      }
      const accessNode = (body.access ?? {}) as Record<string, unknown>;
      if (accessNode.canView !== true) {
        return reply.status(403).send({ error: "download_not_allowed_by_script_visibility" });
      }

      await repository.recordScriptDownload({
        scriptId,
        writerUserId,
        industryAccountId: access.industryAccountId,
        downloadedByUserId: authUserId
      });
      try {
        await publishScriptDownloadedNotification(
          requestFn,
          notificationServiceBase,
          authUserId,
          writerUserId,
          scriptId
        );
      } catch (error) {
        req.log.warn({ error }, "failed to publish script download notification");
      }
      return reply.send({
        scriptId,
        writerUserId,
        industryAccountId: access.industryAccountId,
        view: body
      });
    }
  });

  return server;
}

export async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 4009);
  const server = buildServer();
  await server.listen({ port, host: "0.0.0.0" });
}

function isMainModule(metaUrl: string): boolean {
  if (!process.argv[1]) {
    return false;
  }
  return metaUrl === pathToFileURL(process.argv[1]).href;
}

if (isMainModule(import.meta.url)) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
