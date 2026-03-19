import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_AUTH_ROUTES = ["/signin", "/forgot-password", "/reset-password"];
const defaultGatewayBase = "http://localhost:4000";

function getApiGatewayBase(): string {
  return process.env.API_GATEWAY_URL ?? defaultGatewayBase;
}

async function resolveCallerRole(
  sessionToken: string
): Promise<string | null> {
  try {
    const response = await fetch(
      new URL("/api/v1/auth/me", getApiGatewayBase()),
      {
        headers: { authorization: `Bearer ${sessionToken}` },
        cache: "no-store",
      }
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      user?: { role?: string };
    };
    return body.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const hasSession = request.cookies.has("sm_session");

  // Signed-in users hitting auth pages → redirect to home.
  // Exception: allow OAuth callback through (?code=&state=) so the
  // signin page can exchange the code before the cookie exists.
  if (
    hasSession &&
    PUBLIC_AUTH_ROUTES.includes(pathname) &&
    !searchParams.has("code")
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Admin pages require an authenticated admin session.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!hasSession) {
      return NextResponse.redirect(new URL("/signin", request.url));
    }

    const sessionToken = request.cookies.get("sm_session")?.value;
    if (!sessionToken) {
      return NextResponse.redirect(new URL("/signin", request.url));
    }

    const role = await resolveCallerRole(sessionToken);
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/signin",
    "/forgot-password",
    "/reset-password",
    "/admin",
    "/admin/:path*",
  ],
};
