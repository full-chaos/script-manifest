import { proxyRequest } from "../../../../../_proxy";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; competitionId: string }> }
) {
  const { projectId, competitionId } = await context.params;
  return proxyRequest(
    request,
    `/api/v1/projects/${encodeURIComponent(projectId)}/recommendations/${encodeURIComponent(competitionId)}/pin`
  );
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string; competitionId: string }> }
) {
  const { projectId, competitionId } = await context.params;
  return proxyRequest(
    request,
    `/api/v1/projects/${encodeURIComponent(projectId)}/recommendations/${encodeURIComponent(competitionId)}/pin`
  );
}
