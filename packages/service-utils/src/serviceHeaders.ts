import { signServiceToken, verifyServiceToken, type ServiceTokenPayload } from "./jwt.js";
import type { Role } from "./rbac.js";

export function resolveServiceSecret(): string | null {
  return process.env.SERVICE_TOKEN_SECRET ?? null;
}

export function makeServiceHeaders(
  sub: string,
  role: Role = "writer",
  extra?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...extra,
  };

  const secret = resolveServiceSecret();
  if (secret) {
    headers["x-service-token"] = signServiceToken({ sub, role }, secret);
  }

  return headers;
}

export function verifyInternalToken(headers: Record<string, unknown>): ServiceTokenPayload | null {
  const token = headers["x-service-token"];
  if (typeof token !== "string") return null;
  const secret = resolveServiceSecret();
  if (!secret) return null;
  return verifyServiceToken(token, secret);
}

export function requireServiceToken(headers: Record<string, unknown>): boolean {
  return verifyInternalToken(headers) !== null;
}

export function requireAdminServiceToken(headers: Record<string, unknown>): string | null {
  const payload = verifyInternalToken(headers);
  if (payload?.role !== "admin") return null;
  const userId = headers["x-auth-user-id"];
  return typeof userId === "string" && userId.length > 0 ? userId : payload.sub;
}
