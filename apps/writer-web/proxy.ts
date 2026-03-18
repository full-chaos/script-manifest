import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_AUTH_ROUTES = ["/signin", "/forgot-password", "/reset-password"];

export function proxy(request: NextRequest) {
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/signin", "/forgot-password", "/reset-password"],
};
