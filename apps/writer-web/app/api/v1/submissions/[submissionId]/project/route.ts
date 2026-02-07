import { proxyRequest } from "../../../_proxy";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await context.params;
  return proxyRequest(
    request,
    `/api/v1/submissions/${encodeURIComponent(submissionId)}/project`
  );
}
