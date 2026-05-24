import type { FastifyInstance } from "fastify";
import {
  bootstrapService,
  createFastifyServer,
  isMainModule,
  registerMetrics,
  registerSentryErrorHandler,
  setupErrorReporting
} from "@script-manifest/service-utils";
import type { TrustProofMetrics } from "@script-manifest/contracts";
import { createScheduler, SNAPSHOT_REFRESH_INTERVAL_MS, type MetricsScheduler } from "./scheduler.js";
import { PostgresTrustProofMetricsRepository, type TrustProofMetricsRepository } from "./repository.js";

const PUBLIC_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=900";
const ADMIN_CACHE_CONTROL = "private, max-age=60, stale-while-revalidate=240";
const ADMIN_CACHE_TTL_SECONDS = 60;

export type MetricsServiceOptions = {
  logger?: boolean;
  repository?: TrustProofMetricsRepository;
  scheduler?: MetricsScheduler;
};

export function buildServer(options: MetricsServiceOptions = {}): FastifyInstance {
  const server = createFastifyServer({ logger: options.logger });
  const repository = options.repository ?? new PostgresTrustProofMetricsRepository();

  server.get("/healthz", async () => ({ ok: true }));

  server.get("/readyz", async (_request, reply) => {
    if (options.scheduler && !options.scheduler.isReady()) {
      return reply.status(503).send({ ok: false });
    }
    return { ok: true };
  });

  server.get("/internal/trust-proof-metrics/public", async (_request, reply) => {
    const metrics = await getOrRefresh(repository);
    return reply.header("Cache-Control", PUBLIC_CACHE_CONTROL).send({
      metrics: toPublicMetrics(metrics)
    });
  });

  server.get("/internal/admin/trust-proof-metrics", async (request, reply) => {
    if (request.headers["x-auth-user-role"] !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }
    const metrics = await getOrRefresh(repository);
    return reply.header("Cache-Control", ADMIN_CACHE_CONTROL).send(toAdminResponse(metrics));
  });

  server.post("/internal/admin/trust-proof-metrics/refresh", async (request, reply) => {
    if (request.headers["x-auth-user-role"] !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }
    const metrics = await repository.refreshSnapshot();
    return reply.header("Cache-Control", ADMIN_CACHE_CONTROL).send(toAdminResponse(metrics));
  });

  return server;
}

async function getOrRefresh(repository: TrustProofMetricsRepository): Promise<TrustProofMetrics> {
  return (await repository.getLatestSnapshot()) ?? repository.refreshSnapshot();
}

function toPublicMetrics(metrics: TrustProofMetrics) {
  return {
    snapshotAt: metrics.snapshotAt,
    scriptsHostedTotal: metrics.scriptsHostedTotal,
    placementsRecordedTotal: metrics.placementsRecordedTotal,
    placementsVerifiedTotal: metrics.placementsVerifiedTotal,
    competitionsTrackedTotal: metrics.competitionsTrackedTotal,
    exportsGeneratedTotal: metrics.exportsGeneratedTotal,
    verifiedIndustryDownloadsTotal: metrics.verifiedIndustryDownloadsTotal,
    writersExportablePct: metrics.writersExportablePct
  };
}

function toAdminResponse(metrics: TrustProofMetrics) {
  return {
    metrics,
    refresh: {
      refreshedAt: new Date().toISOString(),
      cacheTtlSeconds: ADMIN_CACHE_TTL_SECONDS,
      warnings: buildWarnings(metrics)
    }
  };
}

function buildWarnings(metrics: TrustProofMetrics): Array<{ metric: string; reason: string }> {
  const warnings: Array<{ metric: string; reason: string }> = [];
  if (metrics.exportsGeneratedTotal === 0 || metrics.sourceDataStamps.exportsMaxGeneratedAt === null) {
    warnings.push({ metric: "exportsGeneratedTotal", reason: "No generated writer export events have been recorded yet." });
  }
  return warnings;
}

export async function startServer(): Promise<void> {
  const boot = bootstrapService("metrics-service");
  setupErrorReporting("metrics-service");
  const repository = new PostgresTrustProofMetricsRepository();
  const scheduler = createScheduler(repository);
  const server = buildServer({ repository, scheduler });

  await scheduler.start();
  boot.phase(`scheduler started (${SNAPSHOT_REFRESH_INTERVAL_MS}ms)`);
  await registerMetrics(server);
  registerSentryErrorHandler(server);
  const port = Number(process.env.PORT ?? 4014);
  await server.listen({ port, host: "0.0.0.0" });
  boot.ready(port);
}

if (isMainModule(import.meta.url)) {
  startServer().catch((error) => { process.stderr.write(String(error) + "\n"); process.exit(1); });
}
