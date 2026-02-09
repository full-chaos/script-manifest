import { NextResponse } from "next/server";

const defaultGatewayBase = "http://localhost:4000";

function getApiGatewayBase(): string {
  return process.env.API_GATEWAY_URL ?? defaultGatewayBase;
}

export async function proxyRequest(request: Request, path: string): Promise<NextResponse> {
  const url = new URL(request.url);
  const upstreamUrl = new URL(path, getApiGatewayBase());
  for (const [key, value] of url.searchParams.entries()) {
    upstreamUrl.searchParams.append(key, value);
  }

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const authorization = request.headers.get("authorization");
  if (authorization) {
    headers.set("authorization", authorization);
  }
  const adminUserId = request.headers.get("x-admin-user-id");
  if (adminUserId) {
    headers.set("x-admin-user-id", adminUserId);
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
