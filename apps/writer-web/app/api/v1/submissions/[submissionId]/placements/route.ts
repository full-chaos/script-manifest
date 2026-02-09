import { proxyRequest } from "../../../_proxy";

export async function GET(
  request: Request,
  context: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await context.params;
  return proxyRequest(request, `/api/v1/submissions/${encodeURIComponent(submissionId)}/placements`);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await context.params;
  return proxyRequest(request, `/api/v1/submissions/${encodeURIComponent(submissionId)}/placements`);
}
