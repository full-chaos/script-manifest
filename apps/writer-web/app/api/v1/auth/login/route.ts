import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const defaultGatewayBase = "http://localhost:4000";

function getApiGatewayBase(): string {
  return process.env.API_GATEWAY_URL ?? defaultGatewayBase;
}

export async function POST(request: Request) {
  const upstreamUrl = new URL("/api/v1/auth/login", getApiGatewayBase());
  const bodyText = await request.text();

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers,
      body: bodyText,
      cache: "no-store"
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "api_gateway_unavailable",
        detail: error instanceof Error ? error.message : "unknown_error"
      },
      { status: 502 }
    );
  }

  const raw = await upstream.text();
  if (!raw) {
    return new NextResponse(null, { status: upstream.status });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    body = raw;
  }

  if (upstream.ok) {
    const session = body as { token?: string; session?: { token?: string } };
    const token = session.token ?? session.session?.token;
    if (token) {
      const cookieStore = await cookies();
      cookieStore.set("sm_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 // 1 hour — matches session TTL
      });
    }
  }

  return NextResponse.json(body, { status: upstream.status });
}
