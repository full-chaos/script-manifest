import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const defaultGatewayBase = "http://localhost:4000";

function getApiGatewayBase(): string {
  return process.env.API_GATEWAY_URL ?? defaultGatewayBase;
}

const ADMIN_PATH_PREFIX = "/api/v1/admin/";

async function resolveCallerRole(authorization: string | null): Promise<string | null> {
  if (!authorization) return null;
  try {
    const identityBase = process.env.API_GATEWAY_URL ?? defaultGatewayBase;
    const meResponse = await fetch(new URL("/api/v1/auth/me", identityBase), {
      headers: { authorization },
      cache: "no-store"
    });
    if (!meResponse.ok) return null;
    const body = (await meResponse.json()) as { user?: { role?: string } };
    return body.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function proxyRequest(request: Request, path: string): Promise<NextResponse> {
  // Read session token from HttpOnly cookie (server-side only)
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get("sm_session")?.value;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  // Prefer cookie token; fall back to forwarded Authorization header from client
  const clientAuthorization = request.headers.get("authorization");
  const resolvedAuthorization = cookieToken
    ? `Bearer ${cookieToken}`
    : (clientAuthorization ?? null);

  if (resolvedAuthorization) {
    headers.set("authorization", resolvedAuthorization);
  }

  if (path.startsWith(ADMIN_PATH_PREFIX)) {
    const role = await resolveCallerRole(resolvedAuthorization);
    if (role !== "admin") {
      return NextResponse.json({ error: "forbidden", detail: "Admin role required." }, { status: 403 });
    }
  }

  const url = new URL(request.url);
  const upstreamUrl = new URL(path, getApiGatewayBase());
  for (const [key, value] of url.searchParams.entries()) {
    upstreamUrl.searchParams.append(key, value);
  }

  const method = request.method;
  const canHaveBody = !["GET", "HEAD"].includes(method.toUpperCase());
  const bodyText = canHaveBody ? await request.text() : undefined;

  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body: canHaveBody ? bodyText : undefined,
      cache: "no-store"
    });

    const raw = await upstream.text();
    if (!raw) {
      return new NextResponse(null, { status: upstream.status });
    }

    const parsed = safeJsonParse(raw);
    return NextResponse.json(parsed, { status: upstream.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: "api_gateway_unavailable",
        detail: error instanceof Error ? error.message : "unknown_error"
      },
      { status: 502 }
    );
  }
}

function safeJsonParse(payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return payload;
  }
}
