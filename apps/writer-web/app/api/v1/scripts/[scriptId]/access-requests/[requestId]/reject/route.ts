import { proxyRequest } from "../../../../../_proxy";

export async function POST(
  request: Request,
  context: { params: Promise<{ scriptId: string; requestId: string }> }
) {
  const { scriptId, requestId } = await context.params;
  return proxyRequest(
    request,
    `/api/v1/scripts/${encodeURIComponent(scriptId)}/access-requests/${encodeURIComponent(requestId)}/reject`
  );
}
