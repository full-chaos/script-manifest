import { proxyRequest } from "../../_proxy";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ writerId: string }> }
) {
  const { writerId } = await context.params;
  return proxyRequest(request, `/api/v1/profiles/${encodeURIComponent(writerId)}`);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ writerId: string }> }
) {
  const { writerId } = await context.params;
  return proxyRequest(request, `/api/v1/profiles/${encodeURIComponent(writerId)}`);
}
