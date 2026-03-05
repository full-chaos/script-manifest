import * as Sentry from "@sentry/node";

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
