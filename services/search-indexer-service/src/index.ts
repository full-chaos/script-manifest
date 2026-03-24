import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { request } from "undici";
import { bootstrapService, registerMetrics, registerSentryErrorHandler, setupErrorReporting, validateRequiredEnv, isMainModule } from "@script-manifest/service-utils";
import {
  CompetitionIndexBulkRequestSchema,
  CompetitionIndexDocumentSchema,
  type Competition
} from "@script-manifest/contracts";

type RequestFn = typeof request;

export type SearchIndexerOptions = {
  logger?: boolean;
  requestFn?: RequestFn;
  openSearchBase?: string;
  openSearchIndex?: string;
};

export function buildServer(options: SearchIndexerOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger === false ? false : {
      level: process.env.LOG_LEVEL ?? "info",
    },
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    requestIdHeader: "x-request-id",
  });
  const requestFn = options.requestFn ?? request;
  const openSearchBase = options.openSearchBase ?? "http://localhost:9200";
  const openSearchIndex = options.openSearchIndex ?? "competitions_v1";

  server.get("/health", async (_req, reply) => {
    const checks: Record<string, boolean> = {};
    try {
      const res = await requestFn(`${openSearchBase}/_cluster/health`, { method: "GET" });
      // Drain response body to prevent resource leak
      await res.body.text();
      checks.opensearch = res.statusCode === 200;
    } catch {
      checks.opensearch = false;
    }
    const ok = Object.values(checks).every(Boolean);
    return reply.status(ok ? 200 : 503).send({ service: "search-indexer-service", ok, checks, index: openSearchIndex });
  });

  server.get("/health/live", async () => ({ ok: true }));

  server.get("/health/ready", async (_req, reply) => {
    const checks: Record<string, boolean> = {};
    try {
      const res = await requestFn(`${openSearchBase}/_cluster/health`, { method: "GET" });
      await res.body.text();
      checks.opensearch = res.statusCode === 200;
    } catch {
      checks.opensearch = false;
    }
    const ok = Object.values(checks).every(Boolean);
    return reply.status(ok ? 200 : 503).send({ service: "search-indexer-service", ok, checks, index: openSearchIndex });
  });

  // ── Admin: Index Status ──────────────────────────────────────────

  server.get("/internal/admin/search/status", async (_req, reply) => {
    try {
      const [healthRes, statsRes] = await Promise.all([
        requestFn(`${openSearchBase}/_cluster/health`, { method: "GET" }),
        requestFn(`${openSearchBase}/${encodeURIComponent(openSearchIndex)}/_stats`, { method: "GET" })
      ]);

      const healthBody = await readBody(healthRes) as Record<string, unknown> | null;
      const statsBody = await readBody(statsRes) as Record<string, unknown> | null;

      const clusterHealth = (healthBody && typeof healthBody.status === "string")
        ? healthBody.status
        : "unknown";

      // Extract doc count and size from stats
      let documentCount = 0;
      let indexSizeBytes = 0;
      if (statsBody && isRecord(statsBody._all)) {
        const all = statsBody._all as Record<string, unknown>;
        if (isRecord(all.primaries)) {
          const primaries = all.primaries as Record<string, unknown>;
          if (isRecord(primaries.docs)) {
            const docs = primaries.docs as Record<string, unknown>;
            documentCount = typeof docs.count === "number" ? docs.count : 0;
          }
          if (isRecord(primaries.store)) {
            const store = primaries.store as Record<string, unknown>;
            indexSizeBytes = typeof store.size_in_bytes === "number" ? store.size_in_bytes : 0;
          }
        }
      }

      return reply.send({
        clusterHealth,
        indexName: openSearchIndex,
        documentCount,
        indexSizeBytes,
        lastSyncAt: null
      });
    } catch (error) {
      server.log.error(error);
      return reply.status(502).send({ error: "opensearch_unavailable" });
    }
  });

  // ── Admin: Reindex All ─────────────────────────────────────────

  server.post("/internal/admin/search/reindex", async (_req, reply) => {
    const jobId = `reindex_${randomUUID()}`;
    // Stub: in production this would trigger an async reindex job
    // For now, delete and recreate the index
    try {
      // Delete existing index
      const deleteRes = await requestFn(`${openSearchBase}/${encodeURIComponent(openSearchIndex)}`, {
        method: "DELETE"
      });
      await readBody(deleteRes);

      // Recreate the index
      await ensureIndex(requestFn, openSearchBase, openSearchIndex);
    } catch {
      // Index may not exist — that's fine
    }

    return reply.status(202).send({
      jobId,
      type: "all",
      status: "started",
      startedAt: new Date().toISOString()
    });
  });

  // ── Admin: Reindex by Type ─────────────────────────────────────

  server.post<{ Params: { type: string } }>("/internal/admin/search/reindex/:type", async (req, reply) => {
    const reindexType = req.params.type;
    if (reindexType !== "competitions") {
      return reply.status(400).send({ error: "unsupported_reindex_type", supportedTypes: ["competitions"] });
    }

    const jobId = `reindex_${randomUUID()}`;
    // Stub: trigger type-specific reindex
    try {
      const deleteRes = await requestFn(`${openSearchBase}/${encodeURIComponent(openSearchIndex)}`, {
        method: "DELETE"
      });
      await readBody(deleteRes);
      await ensureIndex(requestFn, openSearchBase, openSearchIndex);
    } catch {
      // Index may not exist
    }

    return reply.status(202).send({
      jobId,
      type: reindexType,
      status: "started",
      startedAt: new Date().toISOString()
    });
  });

  server.post("/internal/index/competition", async (req, reply) => {
    const parsedBody = CompetitionIndexDocumentSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    try {
      await ensureIndex(requestFn, openSearchBase, openSearchIndex);
      const upstream = await requestFn(
        `${openSearchBase}/${encodeURIComponent(openSearchIndex)}/_doc/${encodeURIComponent(parsedBody.data.id)}?refresh=true`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsedBody.data)
        }
      );

      const body = await readBody(upstream);
      return reply.status(upstream.statusCode).send(body);
    } catch (error) {
      server.log.error(error);
      return reply.status(502).send({ error: "opensearch_unavailable" });
    }
  });

  server.post("/internal/index/competition/bulk", async (req, reply) => {
    const parsedBody = CompetitionIndexBulkRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    const documents = parsedBody.data;
    if (documents.length === 0) {
      return reply.send({
        index: openSearchIndex,
        requested: 0,
        indexed: 0
      });
    }

    try {
      await ensureIndex(requestFn, openSearchBase, openSearchIndex);
      const bulkPayload = toBulkPayload(documents, openSearchIndex);
      const upstream = await requestFn(`${openSearchBase}/_bulk?refresh=true`, {
        method: "POST",
        headers: { "content-type": "application/x-ndjson" },
        body: bulkPayload
      });
      const body = await readBody(upstream);

      if (upstream.statusCode >= 400) {
        return reply.status(upstream.statusCode).send(body);
      }

      const indexed = countIndexed(body);
      return reply.send({
        index: openSearchIndex,
        requested: documents.length,
        indexed,
        result: body
      });
    } catch (error) {
      server.log.error(error);
      return reply.status(502).send({ error: "opensearch_unavailable" });
    }
  });

  server.delete<{ Params: { competitionId: string } }>("/internal/index/competition/:competitionId", async (req, reply) => {
    const { competitionId } = req.params;

    try {
      const upstream = await requestFn(
        `${openSearchBase}/${encodeURIComponent(openSearchIndex)}/_doc/${encodeURIComponent(competitionId)}?refresh=true`,
        { method: "DELETE" }
      );

      const body = await readBody(upstream);
      if (upstream.statusCode === 404) {
        return reply.status(404).send({ error: "not_found", competitionId });
      }
      return reply.status(upstream.statusCode).send(body);
    } catch (error) {
      server.log.error(error);
      return reply.status(502).send({ error: "opensearch_unavailable" });
    }
  });

  return server;
}

export async function startServer(): Promise<void> {
  const boot = bootstrapService("search-indexer-service");
  setupErrorReporting("search-indexer-service");
  
  validateRequiredEnv(["OPENSEARCH_URL"]);
  boot.phase("env validated");
  const port = Number(process.env.PORT ?? 4003);
  const server = buildServer({
    openSearchBase: process.env.OPENSEARCH_URL,
    openSearchIndex: process.env.OPENSEARCH_INDEX
  });
  boot.phase("server built");
  
  // Register Prometheus metrics endpoint (only in production server startup, not tests).
  await registerMetrics(server);
  registerSentryErrorHandler(server);
  await server.listen({ port, host: "0.0.0.0" });
  boot.ready(port);
}

async function ensureIndex(
  requestFn: RequestFn,
  openSearchBase: string,
  openSearchIndex: string
): Promise<void> {
  const head = await requestFn(`${openSearchBase}/${encodeURIComponent(openSearchIndex)}`, {
    method: "HEAD"
  });
  if (head.statusCode === 200) {
    return;
  }

  if (head.statusCode !== 404) {
    throw new Error(`unexpected_index_check_status_${head.statusCode}`);
  }

  const createIndex = await requestFn(`${openSearchBase}/${encodeURIComponent(openSearchIndex)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mappings: {
        properties: {
          title: { type: "text" },
          description: { type: "text" },
          format: { type: "keyword" },
          genre: { type: "keyword" },
          feeUsd: { type: "float" },
          deadline: { type: "date" },
          status: { type: "keyword" },
          visibility: { type: "keyword" },
          accessType: { type: "keyword" }
        }
      }
    })
  });

  if (createIndex.statusCode >= 400) {
    const body = await readBody(createIndex);
    throw new Error(`failed_to_create_index_${createIndex.statusCode}:${JSON.stringify(body)}`);
  }
}

function toBulkPayload(documents: Competition[], openSearchIndex: string): string {
  const lines = documents.flatMap((document) => [
    JSON.stringify({ index: { _index: openSearchIndex, _id: document.id } }),
    JSON.stringify(document)
  ]);
  return `${lines.join("\n")}\n`;
}

function countIndexed(result: unknown): number {
  if (!isRecord(result)) {
    return 0;
  }

  const items = result.items;
  if (!Array.isArray(items)) {
    return 0;
  }

  let indexed = 0;
  for (const item of items) {
    if (!isRecord(item)) {
      continue;
    }
    const indexResult = item.index;
    if (!isRecord(indexResult)) {
      continue;
    }
    const status = indexResult.status;
    if (typeof status === "number" && status >= 200 && status < 300) {
      indexed += 1;
    }
  }

  return indexed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readBody(upstream: Awaited<ReturnType<typeof request>>): Promise<unknown> {
  const raw = await upstream.body.text();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

if (isMainModule(import.meta.url)) {
  startServer().catch((error) => { process.stderr.write(String(error) + "\n"); process.exit(1); });
}
