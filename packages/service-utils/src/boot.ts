/**
 * Lightweight startup bootstrap for microservices.
 *
 * Call `bootstrapService(name)` at the **very top** of `startServer()` —
 * before env validation, before Fastify is created, before anything async.
 *
 * What it does:
 * 1. Prints a startup banner to stdout (visible even if pino/Fastify never
 *    initializes).
 * 2. Installs global `uncaughtException` / `unhandledRejection` handlers so
 *    that fatal errors always produce output before the process exits.
 * 3. Installs a `SIGTERM` handler that logs before exiting (useful for
 *    understanding Docker stop / health-check-induced kills).
 * 4. Returns a tiny logger for milestone breadcrumbs (`phase`, `ready`).
 *
 * All output uses `console.log` / `console.error` — NOT a Fastify/pino
 * logger — because the whole point is to produce output **before** and
 * **after** the structured logger's lifetime.
 *
 * @example
 * ```ts
 * import { bootstrapService } from "@script-manifest/service-utils";
 *
 * export async function startServer() {
 *   const boot = bootstrapService("api-gateway");
 *   validateRequiredEnv([...]);
 *   boot.phase("env validated");
 *   const server = buildServer({ ... });
 *   boot.phase("server built");
 *   await server.listen({ port, host: "0.0.0.0" });
 *   boot.ready(port);
 * }
 * ```
 */

export interface BootLogger {
  /** Log a startup milestone, e.g. `boot.phase("env validated")`. */
  phase(msg: string): void;
  /** Log the final "ready" banner with the listening port. */
  ready(port: number): void;
}

export function bootstrapService(name: string): BootLogger {
  const tag = `[${name}]`;

  // ── Startup banner ──────────────────────────────────────────────────
  console.log(
    `${tag} booting (pid=${process.pid}, node=${process.version}, env=${process.env.NODE_ENV ?? "development"})`,
  );

  // ── Global crash handlers ───────────────────────────────────────────
  // These fire for errors that escape the startServer().catch() — e.g.
  // top-level ESM import failures or truly unhandled promise rejections.
  process.on("uncaughtException", (err) => {
    console.error(`${tag} FATAL uncaught exception:`, err);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    console.error(`${tag} FATAL unhandled rejection:`, reason);
    process.exit(1);
  });

  // ── Graceful shutdown logging ───────────────────────────────────────
  // When Docker sends SIGTERM (stop, restart, health-check kill), log it
  // so the operator knows the process didn't just vanish.
  process.once("SIGTERM", () => {
    console.log(`${tag} received SIGTERM, shutting down`);
  });

  process.once("SIGINT", () => {
    console.log(`${tag} received SIGINT, shutting down`);
  });

  // ── Milestone logger ────────────────────────────────────────────────
  return {
    phase(msg: string) {
      console.log(`${tag} ${msg}`);
    },
    ready(port: number) {
      console.log(`${tag} ready on :${port}`);
    },
  };
}
