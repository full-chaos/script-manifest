import { proxyRequest } from "../../../../_proxy";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ providerId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { providerId } = await context.params;
  return proxyRequest(request, `/api/v1/coverage/admin/providers/${encodeURIComponent(providerId)}/verification`);
}

export async function GET(request: Request, context: RouteContext) {
  const { providerId } = await context.params;
  return proxyRequest(request, `/api/v1/coverage/admin/providers/${encodeURIComponent(providerId)}/verification-events`);
}
