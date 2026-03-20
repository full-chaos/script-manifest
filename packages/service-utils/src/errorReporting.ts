import * as Sentry from "@sentry/node";
import type { FastifyInstance, FastifyError } from "fastify";

/**
 * Initialize error reporting via Sentry SDK (targets BugSink or Sentry).
 *
 * Opt-in via SENTRY_DSN env var. When not set, this is a no-op.
 *
 * Call this AFTER bootstrapService() but BEFORE building the Fastify server.
 *
 * @param serviceName - Logical service name for error grouping
 */
export function setupErrorReporting(serviceName: string): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    serverName: serviceName,
    // Minimal config - BugSink ignores unsupported features gracefully
    tracesSampleRate: 0,
    profilesSampleRate: 0,
  });
}

/**
 * Register a Fastify error handler that forwards unhandled errors to Sentry
 * before responding with a 500.
 *
 * No-op when SENTRY_DSN is not set (i.e. Sentry was never initialized).
 *
 * Call this after buildServer() and before server.listen().
 *
 * @param server - The Fastify instance to attach the error handler to
 */
export function registerSentryErrorHandler(server: FastifyInstance): void {
  if (!process.env.SENTRY_DSN) return;

  server.setErrorHandler((error: FastifyError, _request, reply) => {
    Sentry.captureException(error);

    const statusCode = error.statusCode ?? 500;
    // Only override the response for unexpected server errors; let Fastify's
    // own validation / 4xx errors pass through with their original status.
    if (statusCode >= 500) {
      void reply.status(500).send({ error: "Internal Server Error" });
    } else {
      void reply.status(statusCode).send({ error: error.message });
    }
  });
}
