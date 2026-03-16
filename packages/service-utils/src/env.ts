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
  // Skip validation only in development and test environments.
  // Staging, preview, and production all require real env vars.
  const env = process.env.NODE_ENV ?? "development";
  if (env === "development" || env === "test") return;
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
/**
 * Validates that environment variables containing URLs are parseable.
 *
 * Checks each variable (if set and non-empty) against the URL constructor.
 * Throws an Error listing all invalid URLs with the variable name so the
 * operator knows exactly which env var is misconfigured.
 *
 * Skips variables that are not set — use {@link validateRequiredEnv} to
 * enforce presence separately.
 *
 * @param vars - Array of environment variable names expected to hold URLs.
 * @throws {Error} If any of the set variables contain unparseable URLs.
 */
export function validateUrlEnv(vars: string[]): void {
  const invalid: string[] = [];
  for (const name of vars) {
    const value = process.env[name];
    if (!value) continue; // not set — presence is checked by validateRequiredEnv
    try {
      new URL(value);
    } catch {
      invalid.push(`${name}="${value}"`);
    }
  }
  if (invalid.length > 0) {
    throw new Error(`Invalid URL in environment variables: ${invalid.join(", ")}`);
  }
}

export function warnMissingEnv(vars: string[], serviceName?: string): void {
  const missing = vars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    const prefix = serviceName ? `[${serviceName}] ` : "";
    console.warn(`${prefix}Missing recommended env vars: ${missing.join(", ")}`);
  }
}
