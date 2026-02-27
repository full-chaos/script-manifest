/**
 * Validates that required environment variables are set in production.
 *
 * In non-production environments (NODE_ENV !== "production"), this function
 * is a no-op so local development and CI test runs are not blocked.
 *
 * In production, throws an Error listing all missing variables so the
 * service fails fast at startup rather than silently falling back to
 * localhost defaults.
 *
 * @param vars - Array of environment variable names that must be present.
 * @throws {Error} If NODE_ENV is "production" and any of the vars are unset.
 */
export function validateRequiredEnv(vars: string[]): void {
  if (process.env.NODE_ENV !== "production") return;
  const missing = vars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

/**
 * Logs a warning for any environment variables that are not set.
 *
 * Unlike {@link validateRequiredEnv}, this never throws — it is suitable for
 * non-production builds or "recommended but optional" variables.
 *
 * @param vars - Array of environment variable names to check.
 * @param serviceName - Optional service name prefix for the warning message.
 */
export function warnMissingEnv(vars: string[], serviceName?: string): void {
  const missing = vars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    const prefix = serviceName ? `[${serviceName}] ` : "";
    console.warn(`${prefix}Missing recommended env vars: ${missing.join(", ")}`);
  }
}
