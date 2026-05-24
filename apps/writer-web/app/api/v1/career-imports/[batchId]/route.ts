import { proxyRequest } from "../../_proxy";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ batchId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { batchId } = await context.params;
  return proxyRequest(request, `/api/v1/career-imports/${encodeURIComponent(batchId)}`);
}
