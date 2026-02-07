import { proxyRequest } from "../../../_proxy";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;
  return proxyRequest(request, `/api/v1/projects/${encodeURIComponent(projectId)}/co-writers`);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;
  return proxyRequest(request, `/api/v1/projects/${encodeURIComponent(projectId)}/co-writers`);
}
