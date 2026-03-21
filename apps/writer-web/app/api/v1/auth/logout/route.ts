import { cookies } from "next/headers";
import { proxyRequest } from "../../_proxy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Forward the logout to the gateway to invalidate the server-side session
  const response = await proxyRequest(request, "/api/v1/auth/logout");

  // Always clear the HttpOnly cookie regardless of gateway response
  const cookieStore = await cookies();
  cookieStore.delete("sm_session");

  return response;
}
