import { verifyServiceToken } from "@script-manifest/service-utils";

/**
 * Read the authenticated user ID from the `x-auth-user-id` header.
 * Returns null if the header is absent or empty.
 */
export function readAdminUserId(headers: Record<string, unknown>): string | null {
  const raw = headers["x-auth-user-id"];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * Verify the `x-service-token` header and return the role it carries.
 * Returns null if the token is missing, invalid, or the secret is not configured.
 */
export function readServiceRole(headers: Record<string, unknown>): string | null {
  const token = headers["x-service-token"];
  if (typeof token !== "string") return null;

  const secret = process.env.SERVICE_TOKEN_SECRET;
  if (!secret) return null;

  const payload = verifyServiceToken(token, secret);
  return payload?.role ?? null;
}

/**
 * Require an admin role via service token and return the acting admin user ID.
 * Returns null (forbidden) if the role is not "admin" or the user ID is missing.
 */
export function requireAdmin(headers: Record<string, unknown>): string | null {
  const role = readServiceRole(headers);
  if (role !== "admin") return null;
  return readAdminUserId(headers);
}
