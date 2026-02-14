import { proxyRequest } from "../../../_proxy";

export async function GET(
  request: Request,
  context: { params: Promise<{ scriptId: string }> }
) {
  const { scriptId } = await context.params;
  return proxyRequest(request, `/api/v1/scripts/${encodeURIComponent(scriptId)}/view`);
}
