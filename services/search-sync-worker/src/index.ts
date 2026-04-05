import {
  bootstrapService,
  registerMetrics,
  registerSentryErrorHandler,
  setupErrorReporting,
  validateRequiredEnv,
  isMainModule,
  createFastifyServer,
} from "@script-manifest/service-utils";
import { getTypesenseClient } from "@script-manifest/search";
import { startConsumer } from "./consumer.js";

export function buildServer(options: { logger?: boolean } = {}) {
  const server = createFastifyServer({ logger: options.logger });
  let stopConsumer: () => Promise<void> = async () => {};
  const startedAt = Date.now();

  server.addHook("onReady", async () => {
    startConsumer(server.log)
      .then((stop) => { stopConsumer = stop; })
      .catch((err) => { server.log.error({ err }, "search sync consumer failed to start"); });
  });

  server.addHook("onClose", async () => {
    await stopConsumer();
  });

  server.get("/health", async () => {
    const typesenseOk = await checkTypesense();
    return {
      service: "search-sync-worker",
      ok: typesenseOk,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      typesense: typesenseOk,
    };
  });

  server.get("/health/live", async () => ({ ok: true }));

  server.get("/health/ready", async () => {
    const typesenseOk = await checkTypesense();
    return {
      service: "search-sync-worker",
      ok: typesenseOk,
      typesense: typesenseOk,
    };
  });

  return server;
}

async function checkTypesense(): Promise<boolean> {
  try {
    const client = getTypesenseClient();
    if (!client) return false;
    await client.health.retrieve();
    return true;
  } catch {
    return false;
  }
}

export async function startServer(): Promise<void> {
  const boot = bootstrapService("search-sync-worker");
  setupErrorReporting("search-sync-worker");
  validateRequiredEnv(["PORT", "TYPESENSE_API_KEY"]);
  boot.phase("env validated");

  const port = Number(process.env.PORT ?? 4020);
  const server = buildServer();
  boot.phase("server built");

  await registerMetrics(server);
  registerSentryErrorHandler(server);
  await server.listen({ port, host: "0.0.0.0" });
  boot.ready(port);
}

if (isMainModule(import.meta.url)) {
  startServer().catch((error) => {
    process.stderr.write(String(error) + "\n");
    process.exit(1);
  });
}
