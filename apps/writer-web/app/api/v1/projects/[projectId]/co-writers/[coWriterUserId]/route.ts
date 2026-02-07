import { proxyRequest } from "../../../../_proxy";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string; coWriterUserId: string }> }
) {
  const { projectId, coWriterUserId } = await context.params;
  return proxyRequest(
    request,
    `/api/v1/projects/${encodeURIComponent(projectId)}/co-writers/${encodeURIComponent(coWriterUserId)}`
  );
}
