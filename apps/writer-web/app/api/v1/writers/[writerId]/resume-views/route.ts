import { proxyRequest } from "../../../_proxy";

export async function POST(request: Request, context: { params: Promise<{ writerId: string }> }) {
  const { writerId } = await context.params;
  return proxyRequest(request, `/api/v1/writers/${encodeURIComponent(writerId)}/resume-views`);
}
