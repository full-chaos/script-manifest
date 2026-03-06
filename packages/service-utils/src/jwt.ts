import { createHmac } from "node:crypto";
import type { Role } from "./rbac.js";

export interface ServiceTokenPayload {
  sub: string;
  role: Role;
  iat: number;
  exp: number;
}

function base64url(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return buf.toString("base64url");
}

function base64urlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

const HEADER = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));

export function signServiceToken(
  payload: Omit<ServiceTokenPayload, "iat" | "exp">,
  secret: string,
  ttlSeconds = 300,
): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: ServiceTokenPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };

  const payloadB64 = base64url(JSON.stringify(fullPayload));
  const signature = createHmac("sha256", secret)
    .update(`${HEADER}.${payloadB64}`)
    .digest();

  return `${HEADER}.${payloadB64}.${base64url(signature)}`;
}

export function verifyServiceToken(token: string, secret: string): ServiceTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const header = parts[0];
  const payloadB64 = parts[1];
  const sigB64 = parts[2];
  if (!header || !payloadB64 || !sigB64) {
    return null;
  }
  const expectedSig = createHmac("sha256", secret)
    .update(`${header}.${payloadB64}`)
    .digest("base64url");
  if (expectedSig !== sigB64) {
    return null;
  }

  try {
    const payload = JSON.parse(base64urlDecode(payloadB64 as string)) as ServiceTokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
