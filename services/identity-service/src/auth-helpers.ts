import { verifyInternalToken, requireAdminServiceToken } from "@script-manifest/service-utils";

export function readAdminUserId(headers: Record<string, unknown>): string | null {
  const raw = headers["x-auth-user-id"];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export function readServiceRole(headers: Record<string, unknown>): string | null {
  const payload = verifyInternalToken(headers);
  return payload?.role ?? null;
}

export function requireAdmin(headers: Record<string, unknown>): string | null {
  return requireAdminServiceToken(headers);
}
