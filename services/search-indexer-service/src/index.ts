import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { request } from "undici";
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

  return server;
}

function warnMissingEnv(recommended: string[]): void {
  const missing = recommended.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`[search-indexer-service] Missing recommended env vars: ${missing.join(", ")}`);
  }
}

export async function startServer(): Promise<void> {
  warnMissingEnv(["OPENSEARCH_URL"]);
  const port = Number(process.env.PORT ?? 4003);
  const server = buildServer({
    openSearchBase: process.env.OPENSEARCH_URL,
    openSearchIndex: process.env.OPENSEARCH_INDEX
  });
  await server.listen({ port, host: "0.0.0.0" });
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
          deadline: { type: "date" }
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
