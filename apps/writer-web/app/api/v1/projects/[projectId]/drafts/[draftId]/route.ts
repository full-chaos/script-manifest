import { proxyRequest } from "../../../../_proxy";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string; draftId: string }> }
) {
  const { projectId, draftId } = await context.params;
  return proxyRequest(
    request,
    `/api/v1/projects/${encodeURIComponent(projectId)}/drafts/${encodeURIComponent(draftId)}`
  );
}
