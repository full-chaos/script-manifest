import { proxyRequest } from "../../../../_proxy";

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  return proxyRequest(request, `/api/v1/auth/oauth/${encodeURIComponent(provider)}/start`);
}
