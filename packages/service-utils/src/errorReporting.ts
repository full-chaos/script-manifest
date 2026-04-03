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
 * Register a Fastify error handler that logs unhandled errors to stdout and,
 * when Sentry is configured, forwards them to the error-reporting backend.
 *
 * Always registers a handler regardless of SENTRY_DSN so that errors are
 * never silently swallowed.
 *
 * Call this after buildServer() and before server.listen().
 *
 * @param server - The Fastify instance to attach the error handler to
 */
export function registerSentryErrorHandler(server: FastifyInstance): void {
  const sentryEnabled = !!process.env.SENTRY_DSN;

  server.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    // Always log — this is the primary fix for missing error visibility.
    if (statusCode >= 500) {
      request.log.error({ err: error }, "request failed");
    } else {
      request.log.warn({ err: error, statusCode }, "request error");
    }

    if (sentryEnabled) {
      Sentry.captureException(error);
    }

    // Only override the response for unexpected server errors; let Fastify's
    // own validation / 4xx errors pass through with their original status.
    if (statusCode >= 500) {
      void reply.status(500).send({ error: "Internal Server Error" });
    } else {
      void reply.status(statusCode).send({ error: error.message });
    }
  });
}
