import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  IndustryAccountCreateRequestSchema,
  IndustryAccountVerificationRequestSchema,
  IndustryEntitlementCheckResponseSchema,
  IndustryEntitlementUpsertRequestSchema
} from "@script-manifest/contracts";
import {
  type IndustryPortalRepository,
  PgIndustryPortalRepository
} from "./repository.js";

export type IndustryPortalServiceOptions = {
  logger?: boolean;
  repository?: IndustryPortalRepository;
};

function readHeader(headers: Record<string, unknown>, name: string): string | null {
  const value = headers[name];
  return typeof value === "string" && value.length > 0 ? value : null;
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

  server.addHook("onReady", async () => {
    await repository.init();
  });

  server.get("/health", async (_req, reply) => {
    const checks: Record<string, boolean> = {};
    try {
      const result = await repository.healthCheck();
      checks.database = result.database;
    } catch {
      checks.database = false;
    }
    const ok = Object.values(checks).every(Boolean);
    return reply.status(ok ? 200 : 503).send({ service: "industry-portal-service", ok, checks });
  });

  server.get("/health/live", async () => ({ ok: true }));

  server.get("/health/ready", async (_req, reply) => {
    const checks: Record<string, boolean> = {};
    try {
      const result = await repository.healthCheck();
      checks.database = result.database;
    } catch {
      checks.database = false;
    }
    const ok = Object.values(checks).every(Boolean);
    return reply.status(ok ? 200 : 503).send({ service: "industry-portal-service", ok, checks });
  });

  server.post("/internal/accounts", async (req, reply) => {
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
  });

  server.get("/internal/accounts/:accountId", async (req, reply) => {
    const { accountId } = req.params as { accountId: string };
    const account = await repository.getAccountById(accountId);
    if (!account) {
      return reply.status(404).send({ error: "industry_account_not_found" });
    }
    return reply.send({ account });
  });

  server.post("/internal/accounts/:accountId/verify", async (req, reply) => {
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
  });

  server.put("/internal/entitlements/:writerUserId", async (req, reply) => {
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
  });

  server.get("/internal/entitlements/:writerUserId/check", async (req, reply) => {
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
